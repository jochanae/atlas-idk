import { useEffect, useRef, useReducer } from "react";
import { isAttachmentFlagOn } from "@/lib/attachments/flags";
import { httpAttachmentAdapter } from "@/lib/attachments/adapter";

type UploadState =
  | { status: "uploading" }
  | { status: "done"; id: string }
  | { status: "error" };

/**
 * Pre-uploads attached files the moment they are staged in the composer.
 * By the time the user finishes typing and hits send, the upload is usually
 * already complete — making attachment sends feel instant.
 *
 * Returns `getPreUploadedIds(files)`:
 *   - If every file in `files` finished uploading → returns the ID array.
 *   - If any file is still uploading or errored → returns null (caller falls back).
 */
export function useAttachmentPreUpload(attachedFiles: File[]) {
  const stateRef = useRef(new Map<File, UploadState>());
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!isAttachmentFlagOn("attachments.persistence")) return;

    const current = new Set(attachedFiles);

    for (const f of Array.from(stateRef.current.keys())) {
      if (!current.has(f)) stateRef.current.delete(f);
    }

    for (const file of attachedFiles) {
      if (stateRef.current.has(file)) continue;
      stateRef.current.set(file, { status: "uploading" });

      void (async () => {
        try {
          const { attachmentId, uploadUrl, headers } =
            await httpAttachmentAdapter.requestUpload(file);
          const res = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              ...(headers ?? {}),
            },
            body: file,
          });
          if (!res.ok) throw new Error(`PUT ${res.status}`);
          await httpAttachmentAdapter.finalizeUpload(attachmentId);
          stateRef.current.set(file, { status: "done", id: attachmentId });
        } catch {
          stateRef.current.set(file, { status: "error" });
        }
        bump();
      })();
    }
  }, [attachedFiles]);

  const getPreUploadedIds = (files: File[]): string[] | null => {
    if (files.length === 0) return null;
    const ids: string[] = [];
    for (const f of files) {
      const s = stateRef.current.get(f);
      if (!s || s.status !== "done") return null;
      ids.push(s.id);
    }
    return ids;
  };

  const isPreUploading = Array.from(stateRef.current.values()).some(
    (v) => v.status === "uploading",
  );

  return { getPreUploadedIds, isPreUploading };
}
