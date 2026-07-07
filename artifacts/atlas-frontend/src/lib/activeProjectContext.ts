/**
 * activeProjectContext — shared state describing the project the user is
 * currently inside. Populated by Workspace on mount, consumed by
 * AskAtlasSurface so that opening "Conversation" from within a workspace
 * (or the ambient Ask Atlas floater while in a project) sees the same
 * project identity, memory brief, decisions, and recent events.
 *
 * Deliberately client-only — no new backend endpoints. All data is
 * already fetched by Workspace via existing queries.
 *
 * See plan step 1 (2026-07-07). Paired with the seam changes in
 * askAtlasHelpers (dedupe) and workspace.tsx (populate + view switch).
 */

const STORAGE_KEY = "atlas-active-project";

export type ActiveProjectContext = {
  projectId: number;
  sessionId?: number | null;
  projectName: string;
  memoryBrief?: string | null;      // first ~400 chars of tier-1 brief
  lastUserGoal?: string | null;     // last user message from workspace chat
  recentEvents?: string[];          // human-readable run/preview/file events
  unresolvedDecisions?: Array<{ id: number; title: string }>;
  updatedAt: number;                // epoch ms
};

type Listener = (ctx: ActiveProjectContext | null) => void;

let current: ActiveProjectContext | null = null;
const listeners = new Set<Listener>();

function safeReadStorage(): ActiveProjectContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveProjectContext;
    if (!parsed?.projectId || !parsed?.projectName) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteStorage(ctx: ActiveProjectContext | null) {
  try {
    if (ctx) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Hydrate on module load so a soft reload keeps context available.
if (typeof window !== "undefined") {
  current = safeReadStorage();
}

export function getActiveProjectContext(): ActiveProjectContext | null {
  return current;
}

export function setActiveProjectContext(
  partial: Omit<ActiveProjectContext, "updatedAt"> | null,
): void {
  const next = partial ? { ...partial, updatedAt: Date.now() } : null;
  current = next;
  safeWriteStorage(next);
  for (const l of listeners) {
    try { l(next); } catch { /* ignore */ }
  }
}

export function patchActiveProjectContext(
  patch: Partial<Omit<ActiveProjectContext, "projectId" | "updatedAt">>,
): void {
  if (!current) return;
  const next: ActiveProjectContext = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  current = next;
  safeWriteStorage(next);
  for (const l of listeners) {
    try { l(next); } catch { /* ignore */ }
  }
}

export function clearActiveProjectContext(): void {
  setActiveProjectContext(null);
}

export function subscribeActiveProjectContext(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Build the compact seed string that Ask Atlas prepends as a hidden
 * system-role turn on the first user message when opened in-project.
 * Keep it short — this is context, not a dump.
 */
export function buildWorkspaceContextSeed(ctx: ActiveProjectContext): string {
  const lines: string[] = [`Continuing in ${ctx.projectName} workspace.`];
  if (ctx.memoryBrief) lines.push(`Brief: ${ctx.memoryBrief.slice(0, 400)}`);
  if (ctx.lastUserGoal) lines.push(`Last goal: ${ctx.lastUserGoal.slice(0, 200)}`);
  if (ctx.recentEvents?.length) {
    lines.push(`Recent: ${ctx.recentEvents.slice(0, 5).join(" · ")}`);
  }
  if (ctx.unresolvedDecisions?.length) {
    lines.push(
      `Open decisions: ${ctx.unresolvedDecisions
        .slice(0, 4)
        .map((d) => d.title)
        .join(" · ")}`,
    );
  }
  return lines.join("\n");
}

export function isUnresolvedDecisionEntry(entry: {
  status?: unknown;
  lockedAt?: unknown;
  type?: unknown;
  mode?: unknown;
  verb?: unknown;
}): boolean {
  const status = String(entry.status ?? "").toLowerCase();
  if (!status || status === "committed" || status === "archived" || entry.lockedAt) return false;

  const type = String(entry.type ?? "").toLowerCase();
  const mode = String(entry.mode ?? "").toLowerCase();
  const verb = String(entry.verb ?? "").toLowerCase();
  return type === "decision" || mode === "decide" || mode === "decision" || verb.includes("decide") || verb.includes("decision");
}

// React hook — thin wrapper around the subscribe API.
import { useEffect, useState } from "react";

export function useActiveProjectContext(): ActiveProjectContext | null {
  const [ctx, setCtx] = useState<ActiveProjectContext | null>(() => getActiveProjectContext());
  useEffect(() => subscribeActiveProjectContext(setCtx), []);
  return ctx;
}
