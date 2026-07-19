/**
 * Shared upload service — request-upload → PUT (with progress) → finalize.
 *
 * Used by useStagedAttachments for every staged file. Surfaces must not
 * reimplement this path.
 */

import type { AttachmentAdapter } from "./adapter";
import { httpAttachmentAdapter } from "./adapter";
import type { PersistedAttachment } from "./types";

export type UploadProgressCallback = (progress: number) => void;

export type UploadResult = {
  attachmentId: string;
  persisted: PersistedAttachment;
};

/**
 * PUT with XHR so upload progress events are available.
 * Falls back to fetch when XHR is unavailable (rare / non-browser).
 */
function putWithProgress(
  uploadUrl: string,
  file: File,
  headers: Record<string, string> | undefined,
  onProgress?: UploadProgressCallback,
): Promise<void> {
  if (uploadUrl.startsWith("mock://")) {
    onProgress?.(1);
    return Promise.resolve();
  }

  if (typeof XMLHttpRequest === "undefined") {
    return fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        ...(headers ?? {}),
      },
      body: file,
    }).then((res) => {
      if (!res.ok) throw new Error(`Storage upload failed: ${res.status}`);
      onProgress?.(1);
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    // 2-minute timeout for large files — prevents infinite hung PUT.
    xhr.timeout = 120_000;
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }
    }
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable || !onProgress) return;
      onProgress(Math.min(1, evt.loaded / Math.max(evt.total, 1)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`Storage upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Storage upload network error"));
    xhr.onabort = () => reject(new Error("Storage upload aborted"));
    xhr.ontimeout = () => reject(new Error("Storage upload timed out"));
    xhr.send(file);
  });
}

/** True when an error message indicates a 401 auth failure. */
function is401Error(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // adapter.ts json() produces "Attachment API 401: ..."
  return err.message.includes("401");
}

/**
 * Upload one File through the attachment lifecycle.
 * Does not mutate staged state — the staging hook owns that.
 *
 * Auth-race retry: if request-upload fails with a 401 on the first
 * attempt (common when the file picker returns before the session
 * cookie/token has settled), we wait 1 500 ms and try once more.
 * This matches the auth-settle window in install-api-fetch.ts.
 * A second 401 is surfaced as a normal error so the staging hook
 * can show a retryable chip — it is never a hard app reload.
 */
export async function uploadAttachmentFile(
  file: File,
  opts?: {
    adapter?: AttachmentAdapter;
    onProgress?: UploadProgressCallback;
  },
): Promise<UploadResult> {
  const adapter = opts?.adapter ?? httpAttachmentAdapter;

  let requestResult: Awaited<ReturnType<typeof adapter.requestUpload>>;
  try {
    requestResult = await adapter.requestUpload(file);
  } catch (firstErr) {
    if (is401Error(firstErr)) {
      // Auth may still be settling after picker return — wait then retry once.
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      requestResult = await adapter.requestUpload(file);
    } else {
      throw firstErr;
    }
  }

  const { attachmentId, uploadUrl, headers } = requestResult;
  opts?.onProgress?.(0.05);
  await putWithProgress(uploadUrl, file, headers, (p) => {
    // Map PUT progress into 5%..95%; finalize owns the last 5%.
    opts?.onProgress?.(0.05 + p * 0.9);
  });
  const persisted = await adapter.finalizeUpload(attachmentId);
  opts?.onProgress?.(1);
  return { attachmentId, persisted };
}


/**
 * Upload many files sequentially. Successful uploads are kept even when a
 * later file fails — callers retry only the failed subset.
 */
export async function uploadAttachmentFiles(
  files: File[],
  opts?: {
    adapter?: AttachmentAdapter;
    onFileProgress?: (index: number, progress: number) => void;
  },
): Promise<{
  uploaded: UploadResult[];
  failed: Array<{ index: number; file: File; error: Error }>;
}> {
  const uploaded: UploadResult[] = [];
  const failed: Array<{ index: number; file: File; error: Error }> = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    try {
      const result = await uploadAttachmentFile(file, {
        adapter: opts?.adapter,
        onProgress: (p) => opts?.onFileProgress?.(i, p),
      });
      uploaded.push(result);
    } catch (err) {
      failed.push({
        index: i,
        file,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }
  return { uploaded, failed };
}
