/**
 * attachDebugLog — lightweight attachment-lifecycle instrumentation.
 *
 * Writes timestamped events to:
 *   1. localStorage key "atlas_adbg" (survives page reloads)
 *   2. console.log (visible in remote DevTools / iOS Web Inspector)
 *
 * Access from the browser console:
 *   window.atlasDebugLog()         — returns the full log array
 *   window.atlasDebugClear()       — clears the log
 *   window.atlasDebugPrint()       — console.table the full log
 *   window.__showAttachDebug()     — open the on-screen debug panel
 *
 * Mobile on-screen panel:
 *   Navigate to  #atlas-debug  in the address bar, or call
 *   window.__showAttachDebug() from the DevTools console.
 *   The panel shows the last 60 events and has Copy / Clear buttons.
 *
 * Remove this file and its call sites when the remount investigation is complete.
 */

const STORE_KEY = "atlas_adbg";
const MAX_ENTRIES = 300;

export type DebugEntry = {
  t: number;
  ts: string;
  event: string;
  [key: string]: unknown;
};

/** Staged-file count mirror — updated by useStagedAttachments so the
 *  visibilitychange handler (which runs outside React) can read it. */
let _stagedCount = 0;

export function setStagedCount(n: number): void {
  _stagedCount = n;
  try { sessionStorage.setItem("atlas_sc", String(n)); } catch {}
}

export function getStagedCount(): number {
  return _stagedCount;
}

export function logEvent(event: string, data?: Record<string, unknown>): void {
  try {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
    const entry: DebugEntry = { t: Date.now(), ts, event, ...(data ?? {}) };

    try {
      const arr: DebugEntry[] = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
      arr.push(entry);
      if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
      localStorage.setItem(STORE_KEY, JSON.stringify(arr));
    } catch {
      // localStorage may be unavailable — ignore.
    }

    // eslint-disable-next-line no-console
    console.log(`[📎 AttachDebug ${ts}] ${event}`, data ?? "");
  } catch {
    // Never throw from instrumentation.
  }
}

export function getLog(): DebugEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function clearLog(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
}

/** Dispatch the custom event that resets `lastVis` in the inline script,
 *  preventing chunk-load errors from triggering a reload immediately after
 *  the file picker returns. Call this whenever the picker onChange fires. */
export function signalPickerReturn(): void {
  try {
    window.dispatchEvent(new Event("atlas-picker-return"));
  } catch {}
}

// ── Mobile on-screen debug panel ────────────────────────────────────────────

function buildBtn(label: string, cb: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText =
    "padding:6px 12px;border-radius:6px;border:1px solid #555;background:#1a1a1a;" +
    "color:#e8d9b0;font-family:monospace;font-size:12px;cursor:pointer;flex-shrink:0;";
  b.onclick = cb;
  return b;
}

function showDebugPanel(): void {
  try {
    const existing = document.getElementById("__atlas_dbg_panel__");
    if (existing) { existing.remove(); return; }

    const log = getLog();

    const panel = document.createElement("div");
    panel.id = "__atlas_dbg_panel__";
    panel.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:#0a0a0a;color:#c8c8c8;" +
      "font-family:monospace;font-size:11px;overflow:hidden;display:flex;flex-direction:column;" +
      "box-sizing:border-box;";

    // Header
    const hdr = document.createElement("div");
    hdr.style.cssText =
      "display:flex;gap:6px;padding:10px;background:#111;border-bottom:1px solid #333;flex-shrink:0;flex-wrap:wrap;";

    const count = document.createElement("span");
    count.style.cssText = "flex:1;min-width:0;color:#e8d9b0;font-size:12px;font-weight:bold;align-self:center;";
    count.textContent = `AttachDebug (${log.length} events)`;

    const copyBtn = buildBtn("Copy JSON", () => {
      try {
        void navigator.clipboard.writeText(JSON.stringify(log, null, 2));
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy JSON"; }, 2000);
      } catch {
        // clipboard may need secure context — fall back to alert
        const txt = JSON.stringify(log);
        // eslint-disable-next-line no-alert
        window.prompt("Copy this:", txt);
      }
    });

    const clearBtn = buildBtn("Clear", () => { clearLog(); panel.remove(); });
    const closeBtn = buildBtn("✕", () => { panel.remove(); });

    hdr.appendChild(count);
    hdr.appendChild(copyBtn);
    hdr.appendChild(clearBtn);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    // Event list — newest first
    const list = document.createElement("div");
    list.style.cssText = "flex:1;overflow-y:auto;padding:4px 0;";

    const shown = log.slice(-60).reverse();
    for (const entry of shown) {
      const row = document.createElement("div");
      row.style.cssText =
        "padding:4px 10px;border-bottom:1px solid #1c1c1c;word-break:break-all;line-height:1.4;";

      const extra: Record<string, unknown> = {};
      for (const k of Object.keys(entry)) {
        if (k !== "t" && k !== "ts" && k !== "event") extra[k] = entry[k];
      }
      const extraStr = Object.keys(extra).length
        ? " " + JSON.stringify(extra).slice(0, 200)
        : "";

      const eventColor =
        entry.event.includes("reload") || entry.event.includes("unmount") || entry.event.includes("401")
          ? "#f87171"
          : entry.event.includes("picker") || entry.event.includes("staged")
            ? "#86efac"
            : "#e8d9b0";

      row.innerHTML =
        `<span style="color:#666;margin-right:6px;">${String(entry.ts).slice(11)}</span>` +
        `<span style="color:${eventColor};font-weight:bold;">${entry.event}</span>` +
        `<span style="color:#888;">${extraStr}</span>`;

      list.appendChild(row);
    }

    if (shown.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:20px;color:#555;";
      empty.textContent = "No events logged yet.";
      list.appendChild(empty);
    }

    panel.appendChild(list);
    document.body.appendChild(panel);
  } catch {
    // Never throw from instrumentation.
  }
}

/** Install global console helpers so the log can be read from DevTools
 *  and trigger the on-screen panel via URL hash or direct call. */
export function installDebugGlobals(): void {
  try {
    const w = window as unknown as Record<string, unknown>;
    w.atlasDebugLog = getLog;
    w.atlasDebugClear = clearLog;
    w.atlasDebugPrint = () => {
      // eslint-disable-next-line no-console
      console.table(getLog());
    };
    w.__showAttachDebug = showDebugPanel;

    // Trigger panel from URL bar:  navigate to  #atlas-debug  on any page
    const checkHash = () => {
      if (window.location.hash === "#atlas-debug") {
        // Remove the hash so repeated visits toggle the panel
        history.replaceState(null, "", window.location.pathname + window.location.search);
        showDebugPanel();
      }
    };
    window.addEventListener("hashchange", checkHash);
    checkHash(); // in case the page loaded with the hash already set
  } catch {}
}
