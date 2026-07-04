/**
 * Launch Adapter Layer — Phase 3
 *
 * Atlas determines readiness. Adapters handle execution.
 * The interface is pluggable: today Replit, tomorrow anything.
 *
 * Flow:
 *   PROJECT_READY fires → CommitPill arms → axiom:launch-project dispatched
 *   → LaunchPanel resolves adapter → adapter.launch(spec, onUpdate)
 *   → User sees "Atlas is launching" → adapter reports running → Preview opens
 */

export interface LaunchSpec {
  projectId: number;
  adapter: "replit-devserver" | "atlas-native";
  command?: "start" | "typecheck" | "build";
}

export type LaunchStatus =
  | "idle"
  | "checking"
  | "starting"
  | "running"
  | "failed"
  | "no-scaffold";

export interface LaunchResult {
  status: LaunchStatus;
  previewUrl?: string;
  port?: number;
  errorMsg?: string;
  logs?: string[];
}

export type LaunchUpdateFn = (result: LaunchResult) => void;

export interface LaunchAdapter {
  readonly id: string;
  readonly label: string;
  canHandle(spec: LaunchSpec): boolean;
  /** Returns an abort/cleanup function. */
  launch(spec: LaunchSpec, onUpdate: LaunchUpdateFn): () => void;
}

// ── Replit Devserver Adapter ──────────────────────────────────────────────────
// Calls /api/devserver/workspace/:id/start and polls until running.

export const ReplitDevserverAdapter: LaunchAdapter = {
  id: "replit-devserver",
  label: "Replit",

  canHandle: (spec) => spec.adapter === "replit-devserver",

  launch: (spec, onUpdate) => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };

    const statusUrl = `/api/devserver/workspace/${spec.projectId}/status`;
    const startUrl = `/api/devserver/workspace/${spec.projectId}/start`;

    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(statusUrl, { credentials: "include" });
        if (!r.ok) throw new Error(`Status ${r.status}`);
        const data = (await r.json()) as {
          status: string;
          port?: number;
          hasScaffold?: boolean;
          errorMsg?: string;
          logs?: string[];
        };
        if (cancelled) return;

        if (!data.hasScaffold) {
          onUpdate({ status: "no-scaffold" });
          return;
        }
        if (data.status === "running") {
          onUpdate({
            status: "running",
            previewUrl: `/api/devserver/workspace/${spec.projectId}/proxy/`,
            port: data.port,
          });
          return;
        }
        if (data.status === "error" || data.status === "failed") {
          onUpdate({ status: "failed", errorMsg: data.errorMsg ?? "Launch failed", logs: data.logs });
          return;
        }

        onUpdate({ status: "starting", logs: data.logs });
        if (!cancelled) pollTimer = setTimeout(poll, 2500);
      } catch (err) {
        if (!cancelled) {
          onUpdate({ status: "failed", errorMsg: err instanceof Error ? err.message : "Launch failed" });
        }
      }
    };

    (async () => {
      onUpdate({ status: "checking" });
      if (cancelled) return;

      try {
        const sr = await fetch(statusUrl, { credentials: "include" });
        if (sr.ok) {
          const sd = (await sr.json()) as { hasScaffold?: boolean; status?: string };
          if (!sd.hasScaffold) {
            onUpdate({ status: "no-scaffold" });
            return;
          }
          if (sd.status === "running") {
            onUpdate({
              status: "running",
              previewUrl: `/api/devserver/workspace/${spec.projectId}/proxy/`,
            });
            return;
          }
        }
      } catch { /* proceed to start */ }

      if (cancelled) return;
      onUpdate({ status: "starting" });

      try {
        await fetch(startUrl, { method: "POST", credentials: "include" });
      } catch { /* start fires-and-forgets; poll detects failure */ }

      if (!cancelled) pollTimer = setTimeout(poll, 3000);
    })();

    return cleanup;
  },
};

// ── Atlas Native Adapter ──────────────────────────────────────────────────────
// Delegates to the existing BuildPanel via axiom:build-run.
// BuildPanel owns its own display; this adapter is fire-and-forget.

export const AtlasNativeAdapter: LaunchAdapter = {
  id: "atlas-native",
  label: "Atlas Native",

  canHandle: (spec) => spec.adapter === "atlas-native",

  launch: (spec, onUpdate) => {
    onUpdate({ status: "starting" });
    window.dispatchEvent(
      new CustomEvent("axiom:build-run", {
        detail: { command: spec.command ?? "build", projectId: spec.projectId },
      })
    );
    onUpdate({ status: "running" });
    return () => {};
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const ADAPTERS: LaunchAdapter[] = [ReplitDevserverAdapter, AtlasNativeAdapter];

export function resolveAdapter(spec: LaunchSpec): LaunchAdapter | null {
  return ADAPTERS.find((a) => a.canHandle(spec)) ?? null;
}
