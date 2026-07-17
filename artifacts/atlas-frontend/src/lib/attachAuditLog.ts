/**
 * Temporary attachment-pipeline instrumentation.
 *
 * Records the exact event order for Ask Atlas + Workspace composers so we can
 * distinguish true login redirects from soft remounts / state loss / route changes.
 *
 * Enable with:
 *   localStorage.setItem("atlas-attach-audit", "1")
 * or ?attachAudit=1 in the URL.
 *
 * Dump with:
 *   window.__atlasAttachAudit.dump()
 * Clear with:
 *   window.__atlasAttachAudit.clear()
 *
 * REMOVE once the attach→type failure path is confirmed in production telemetry.
 */

export type AttachAuditEvent =
  | "picker_opened"
  | "file_selected"
  | "file_read_started"
  | "file_read_completed"
  | "file_read_failed"
  | "attachment_state_updated"
  | "composer_rerendered"
  | "text_changed"
  | "draft_save_triggered"
  | "network_request"
  | "auth_response"
  | "router_navigation"
  | "window_location_change"
  | "component_unmount"
  | "component_mount"
  | "error_boundary"
  | "uncaught_error"
  | "visibility_change"
  | "window_focus"
  | "window_blur"
  | "send_started"
  | "send_attachments_included"
  | "send_attachments_dropped";

export interface AttachAuditEntry {
  t: number;
  seq: number;
  event: AttachAuditEvent | string;
  surface?: "ask-atlas" | "workspace" | "shared" | "global";
  detail?: Record<string, unknown>;
  href?: string;
  visibility?: DocumentVisibilityState;
}

declare global {
  interface Window {
    __atlasAttachAudit?: {
      enabled: boolean;
      entries: AttachAuditEntry[];
      log: typeof attachAuditLog;
      dump: () => AttachAuditEntry[];
      clear: () => void;
      summary: () => string;
    };
  }
}

const MAX_ENTRIES = 500;
let seq = 0;
const entries: AttachAuditEntry[] = [];
let installed = false;
let runtimeEnabled = false;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem("atlas-attach-audit") === "1") return true;
    if (new URLSearchParams(window.location.search).get("attachAudit") === "1") return true;
  } catch {
    /* ignore */
  }
  // NOTE: read the internal flag directly — do NOT read window.__atlasAttachAudit.enabled
  // because that is a getter that calls back into isEnabled() → infinite recursion.
  return runtimeEnabled;
}

export function attachAuditLog(
  event: AttachAuditEvent | string,
  detail?: Record<string, unknown>,
  surface?: AttachAuditEntry["surface"],
): void {
  if (typeof window === "undefined") return;
  if (!isEnabled()) return;

  const entry: AttachAuditEntry = {
    t: Date.now(),
    seq: ++seq,
    event,
    surface,
    detail,
    href: window.location.href,
    visibility: document.visibilityState,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  try {
    // Structured console trail for DevTools filtering: `[attach-audit]`
    console.info("[attach-audit]", entry.seq, event, surface ?? "", detail ?? {}, {
      href: entry.href,
      visibility: entry.visibility,
    });
  } catch {
    /* ignore */
  }
}

function summary(): string {
  if (entries.length === 0) return "(no attach-audit events)";
  const lines = entries.map((e) => {
    const d = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
    return `${e.seq}. +${e.t - entries[0]!.t}ms ${e.event}${e.surface ? ` [${e.surface}]` : ""}${d} vis=${e.visibility} href=${e.href}`;
  });
  return lines.join("\n");
}

/** Install global listeners once (navigation, visibility, errors, fetch). */
export function installAttachAudit(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  window.__atlasAttachAudit = {
    get enabled() {
      return isEnabled();
    },
    set enabled(v: boolean) {
      try {
        window.localStorage.setItem("atlas-attach-audit", v ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    entries,
    log: attachAuditLog,
    dump: () => [...entries],
    clear: () => {
      entries.length = 0;
      seq = 0;
    },
    summary,
  };

  // Always install listeners; attachAuditLog no-ops unless enabled.
  let lastHref = window.location.href;

  const checkLocation = () => {
    if (window.location.href !== lastHref) {
      const from = lastHref;
      lastHref = window.location.href;
      attachAuditLog("window_location_change", { from, to: lastHref }, "global");
    }
  };

  // Poll + patch history so SPA navigations are visible.
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    const ret = origPush(...args);
    attachAuditLog("router_navigation", { method: "pushState", url: args[2] }, "global");
    checkLocation();
    return ret;
  }) as History["pushState"];
  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    const ret = origReplace(...args);
    attachAuditLog("router_navigation", { method: "replaceState", url: args[2] }, "global");
    checkLocation();
    return ret;
  }) as History["replaceState"];
  window.addEventListener("popstate", () => {
    attachAuditLog("router_navigation", { method: "popstate" }, "global");
    checkLocation();
  });
  window.setInterval(checkLocation, 250);

  document.addEventListener("visibilitychange", () => {
    attachAuditLog("visibility_change", { state: document.visibilityState }, "global");
  });
  window.addEventListener("focus", () => attachAuditLog("window_focus", undefined, "global"));
  window.addEventListener("blur", () => attachAuditLog("window_blur", undefined, "global"));

  window.addEventListener("error", (ev) => {
    attachAuditLog(
      "uncaught_error",
      { message: ev.message, filename: ev.filename, lineno: ev.lineno },
      "global",
    );
  });
  window.addEventListener("unhandledrejection", (ev) => {
    attachAuditLog(
      "uncaught_error",
      { reason: String((ev as PromiseRejectionEvent).reason) },
      "global",
    );
  });

  // Wrap fetch to record API URL/status (auth + attach-adjacent).
  // Runs after install-api-fetch so we observe rewritten URLs + final status.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const isApi = url.includes("/api/");
    const started = Date.now();
    try {
      const res = await originalFetch(input, init);
      if (isApi) {
        attachAuditLog(
          url.includes("/api/auth/") ? "auth_response" : "network_request",
          {
            url,
            status: res.status,
            method: init?.method ?? "GET",
            ms: Date.now() - started,
          },
          "global",
        );
      }
      return res;
    } catch (err) {
      if (isApi) {
        attachAuditLog(
          "network_request",
          { url, error: String(err), method: init?.method ?? "GET" },
          "global",
        );
      }
      throw err;
    }
  };

  attachAuditLog("component_mount", { what: "attachAuditInstalled" }, "global");
}
