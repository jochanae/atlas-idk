/**
 * Shared upload service — request-upload → PUT (with progress) → finalize.
 *
 * Used by useStagedAttachments for every staged file. Surfaces must not
 * reimplement this path.
 */

import type { AttachmentAdapter } from "./adapter";
import { httpAttachmentAdapter } from "./adapter";
import type { PersistedAttachment } from "./types";
import { logEvent as _adbgLog } from "@/lib/attachDebugLog";

export type UploadProgressCallback = (progress: number) => void;

export type UploadResult = {
  attachmentId: string;
  persisted: PersistedAttachment;
};

/** Hard ceiling for the storage PUT — large files on slow networks. */
export const PUT_TIMEOUT_MS = 120_000;
/**
 * If the PUT reports no progress for this long, abort early so the chip
 * can leave the gold spinner and become retryable.
 */
export const PUT_STALL_TIMEOUT_MS = 25_000;

export type PutWithProgressOptions = {
  onProgress?: UploadProgressCallback;
  /** Caller abort (e.g. user removed the staged chip). */
  signal?: AbortSignal;
  timeoutMs?: number;
  stallTimeoutMs?: number;
};

/**
 * PUT with XHR so upload progress events are available.
 * Falls back to fetch when XHR is unavailable (rare / non-browser).
 *
 * Always time-bounded: hard timeout + stall watchdog + optional abort signal.
 */
export function putWithProgress(
  uploadUrl: string,
  file: File,
  headers: Record<string, string> | undefined,
  opts?: PutWithProgressOptions | UploadProgressCallback,
): Promise<void> {
  const normalized: PutWithProgressOptions =
    typeof opts === "function" ? { onProgress: opts } : (opts ?? {});
  const onProgress = normalized.onProgress;
  const timeoutMs = normalized.timeoutMs ?? PUT_TIMEOUT_MS;
  const stallTimeoutMs = normalized.stallTimeoutMs ?? PUT_STALL_TIMEOUT_MS;
  const externalSignal = normalized.signal;

  if (uploadUrl.startsWith("mock://")) {
    onProgress?.(1);
    return Promise.resolve();
  }

  if (externalSignal?.aborted) {
    return Promise.reject(new Error("Storage upload aborted"));
  }

  if (typeof XMLHttpRequest === "undefined") {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort);
    return fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        ...(headers ?? {}),
      },
      body: file,
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Storage upload failed: ${res.status}`);
        onProgress?.(1);
      })
      .catch((err) => {
        if (externalSignal?.aborted) {
          throw new Error("Storage upload aborted");
        }
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Storage upload timed out");
        }
        throw err;
      })
      .finally(() => {
        clearTimeout(timer);
        externalSignal?.removeEventListener("abort", onExternalAbort);
      });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearTimeout(stallTimer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      fn();
    };

    const armStallWatchdog = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        settle(() => {
          try {
            xhr.abort();
          } catch {
            /* ignore */
          }
          reject(
            new Error(
              "Upload stalled — check your connection and tap Retry",
            ),
          );
        });
      }, stallTimeoutMs);
    };

    const onExternalAbort = () => {
      settle(() => {
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
        reject(new Error("Storage upload aborted"));
      });
    };

    xhr.open("PUT", uploadUrl);
    xhr.timeout = timeoutMs;
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
      armStallWatchdog();
      if (!evt.lengthComputable || !onProgress) return;
      onProgress(Math.min(1, evt.loaded / Math.max(evt.total, 1)));
    };
    xhr.onload = () => {
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve();
        } else {
          reject(new Error(`Storage upload failed: ${xhr.status}`));
        }
      });
    };
    xhr.onerror = () =>
      settle(() => reject(new Error("Storage upload network error")));
    xhr.onabort = () => {
      // External abort / stall already settled with a specific message.
      settle(() => reject(new Error("Storage upload aborted")));
    };
    xhr.ontimeout = () =>
      settle(() =>
        reject(
          new Error("Upload timed out — check your connection and tap Retry"),
        ),
      );

    externalSignal?.addEventListener("abort", onExternalAbort);
    armStallWatchdog();
    xhr.send(file);
  });
}

/** True when an error message indicates a 401 auth failure. */
function is401Error(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // adapter.ts json() produces "Attachment API 401: ..."
  return err.message.includes("401");
}

/** True when the initial request-upload call likely died during picker/network resume. */
function isTransientRequestUploadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /Failed to fetch|Load failed|NetworkError|Request timed out|Attachment API 5\d\d/i.test(
    err.message,
  );
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
    signal?: AbortSignal;
  },
): Promise<UploadResult> {
  const adapter = opts?.adapter ?? httpAttachmentAdapter;

  if (opts?.signal?.aborted) {
    throw new Error("Storage upload aborted");
  }

  let requestResult: Awaited<ReturnType<typeof adapter.requestUpload>>;
  try {
    requestResult = await adapter.requestUpload(file);
  } catch (firstErr) {
    if (opts?.signal?.aborted) {
      throw new Error("Storage upload aborted");
    }
    const retryDelay = is401Error(firstErr)
      ? 1500
      : isTransientRequestUploadError(firstErr)
        ? 750
        : 0;
    if (retryDelay > 0) {
      // Auth/network may still be settling after picker return — wait then retry once.
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
      if (opts?.signal?.aborted) {
        throw new Error("Storage upload aborted");
      }
      requestResult = await adapter.requestUpload(file);
    } else {
      throw firstErr;
    }
  }

  const { attachmentId, uploadUrl, headers } = requestResult;
  opts?.onProgress?.(0.05);
  _adbgLog("put_start", { id: attachmentId });
  try {
    await putWithProgress(uploadUrl, file, headers, {
      onProgress: (p) => {
        // Map PUT progress into 5%..95%; finalize owns the last 5%.
        opts?.onProgress?.(0.05 + p * 0.9);
        if (p === 1 || p >= 0.5) _adbgLog("put_progress", { id: attachmentId, progress: Math.round(p * 100) / 100 });
      },
      signal: opts?.signal,
    });
  } catch (putErr) {
    const putMsg = putErr instanceof Error ? putErr.message : "PUT failed";
    _adbgLog("put_error", { id: attachmentId, message: putMsg });
    throw putErr;
  }
  _adbgLog("put_success", { id: attachmentId });
  if (opts?.signal?.aborted) {
    throw new Error("Storage upload aborted");
  }
  _adbgLog("finalize_start", { id: attachmentId });
  let persisted: PersistedAttachment;
  try {
    persisted = await adapter.finalizeUpload(attachmentId);
  } catch (finalizeErr) {
    const finalizeMsg = finalizeErr instanceof Error ? finalizeErr.message : "Finalize failed";
    _adbgLog("finalize_error", { id: attachmentId, message: finalizeMsg });
    throw finalizeErr;
  }
  _adbgLog("finalize_success", { id: attachmentId });
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
    signal?: AbortSignal;
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
        signal: opts?.signal,
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
