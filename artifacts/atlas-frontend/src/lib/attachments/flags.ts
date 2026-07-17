/**
 * Attachment persistence feature flags.
 *
 * All default OFF so today's inline-base64 send path is untouched until the
 * backend endpoints in .lovable/plan.md Section B are live.
 *
 * Resolution order: localStorage override → import.meta.env → default.
 * Reads are pure functions (no React state) so hooks and non-hook call sites
 * agree.
 */

export type AttachmentFlag =
  | "attachments.persistence"
  | "attachments.useAgain"
  | "attachments.library";

const ENV_KEY: Record<AttachmentFlag, string> = {
  "attachments.persistence": "VITE_FLAG_ATTACHMENTS_PERSISTENCE",
  "attachments.useAgain": "VITE_FLAG_ATTACHMENTS_USE_AGAIN",
  "attachments.library": "VITE_FLAG_ATTACHMENTS_LIBRARY",
};

const LS_PREFIX = "atlas.flag.";

function parseBool(v: unknown): boolean | undefined {
  if (v === true || v === "1" || v === "true" || v === "on") return true;
  if (v === false || v === "0" || v === "false" || v === "off") return false;
  return undefined;
}

export function isAttachmentFlagOn(flag: AttachmentFlag): boolean {
  // localStorage override (dev + QA)
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage.getItem(LS_PREFIX + flag);
      const parsed = parseBool(ls);
      if (parsed !== undefined) return parsed;
    } catch {
      /* ignore quota / privacy errors */
    }
  }
  // Build-time env
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = (import.meta as any)?.env ?? {};
    const parsed = parseBool(env[ENV_KEY[flag]]);
    if (parsed !== undefined) return parsed;
  } catch {
    /* ignore */
  }
  return false;
}

/** Test / QA helper — sets the localStorage override. */
export function setAttachmentFlagOverride(
  flag: AttachmentFlag,
  value: boolean | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(LS_PREFIX + flag);
    else window.localStorage.setItem(LS_PREFIX + flag, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}
