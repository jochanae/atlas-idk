/**
 * Attachment persistence feature flags.
 *
 * Source-of-truth priority for `attachments.persistence`:
 *   1. Build-time kill switch  — VITE_FLAG_ATTACHMENTS_PERSISTENCE=false/0/off
 *      → always off, regardless of server. Emergency disable only.
 *   2. Server capability       — GET /api/capabilities → { attachmentPersistence }
 *      → authoritative once loaded. Server false = off; server true = consult steps 3-4.
 *   3. localStorage override   — atlas.flag.attachments.persistence = "1"/"0"
 *      → QA / dev override after server says true.
 *   4. Build-time opt-in       — VITE_FLAG_ATTACHMENTS_PERSISTENCE=true
 *      → fallback when server hasn't responded yet.
 *
 * Call `loadServerCapabilities()` once at app startup (fire-and-forget).
 * `isAttachmentFlagOn` is synchronous and safe to call before the fetch completes;
 * it falls back to the build-time value until the server response arrives.
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

// ─── Server capabilities cache ────────────────────────────────────────────────

export interface ServerCapabilities {
  attachmentPersistence: boolean;
}

let _serverCaps: ServerCapabilities | null = null;
let _capsFetchPromise: Promise<void> | null = null;

/**
 * Fetch /api/capabilities once and cache the result.
 * Call at app startup (fire-and-forget). Safe to call multiple times.
 */
export async function loadServerCapabilities(): Promise<void> {
  if (_serverCaps !== null) return;
  if (_capsFetchPromise) return _capsFetchPromise;
  _capsFetchPromise = fetch("/api/capabilities", { credentials: "include" })
    .then((r) => {
      if (!r.ok) throw new Error(`capabilities ${r.status}`);
      return r.json() as Promise<Partial<ServerCapabilities>>;
    })
    .then((data) => {
      _serverCaps = {
        attachmentPersistence: data.attachmentPersistence === true,
      };
      try {
        void import("@/lib/attachAuditLog").then(({ attachAuditLog }) => {
          attachAuditLog(
            "capabilities_loaded",
            { attachmentPersistence: _serverCaps!.attachmentPersistence, ok: true },
            "global",
          );
        });
      } catch {
        /* ignore */
      }
    })
    .catch(() => {
      // Network error or server unavailable — default all capabilities off.
      _serverCaps = { attachmentPersistence: false };
      try {
        void import("@/lib/attachAuditLog").then(({ attachAuditLog }) => {
          attachAuditLog(
            "capabilities_loaded",
            { attachmentPersistence: false, ok: false },
            "global",
          );
        });
      } catch {
        /* ignore */
      }
    });
  return _capsFetchPromise;
}

/** Returns the cached server capabilities, or null if not yet loaded. */
export function getServerCapabilities(): ServerCapabilities | null {
  return _serverCaps;
}

// ─── Flag resolution ──────────────────────────────────────────────────────────

export function isAttachmentFlagOn(flag: AttachmentFlag): boolean {
  // 0. HARD KILL SWITCH (Step 1 rollback, 2026-07-18).
  // The persistence pipeline is dormant pending Step 2 (delete) + Step 3 (rebuild).
  // Every send falls back to inline base64 through the legacy path.
  // Do NOT remove without explicit approval — this is the "stop the bleeding" flag.
  if (flag === "attachments.persistence") return false;
  if (flag === "attachments.useAgain" || flag === "attachments.library") return false;

  // 1. Build-time kill switch — if explicitly false, always off.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = (import.meta as any)?.env ?? {};
    const buildVal = parseBool(env[ENV_KEY[flag]]);
    if (buildVal === false) return false;
  } catch {
    /* ignore */
  }

  // 2. Server capability is authoritative once loaded.
  if (_serverCaps !== null && flag === "attachments.persistence") {
    if (!_serverCaps.attachmentPersistence) return false;
    // Server says true — continue to localStorage override then confirm on.
  }

  // 3. localStorage override (dev + QA).
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage.getItem(LS_PREFIX + flag);
      const parsed = parseBool(ls);
      if (parsed !== undefined) return parsed;
    } catch {
      /* ignore quota / privacy errors */
    }
  }

  // 4. Server confirmed true for persistence — enable.
  if (_serverCaps !== null && flag === "attachments.persistence") {
    return _serverCaps.attachmentPersistence === true;
  }

  // 5. Server not yet loaded — fall back to build-time opt-in.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = (import.meta as any)?.env ?? {};
    return parseBool(env[ENV_KEY[flag]]) === true;
  } catch {
    return false;
  }
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
