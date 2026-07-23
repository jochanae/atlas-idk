const BUILD_INTENT_RE =
  /\b(let'?s build|i'?ll build|let me build|implement(?:ing|ed)?|scaffold(?:ing|ed)?|create the (?:project|workspace|file|component)|spin up|kick off the build|start building|wire (?:this )?up|generate the (?:project|code|files))\b/i;

/**
 * Canonical destination resolver for a conversation row.
 *
 * Both the Projects drawer (ATLAS section) and the Ask Joy clock/history
 * sheet render the same underlying conversation list. Route every tap through
 * this resolver so promoted threads always land in their workspace and
 * non-promoted threads always reopen inside Ask Joy — no surface-specific
 * click logic, no detached copies of a thread that already belongs to a
 * workspace.
 */
export type ConversationLike = {
  id: string | number;
  type?: "conversation" | "promoted" | null;
  projectId?: number | null;
  projectName?: string | null;
};

export type ConversationDestination =
  | { kind: "workspace"; projectId: number; projectName: string | null; conversationId: string }
  | { kind: "ask-atlas"; conversationId: string };

export function resolveConversationDestination(conv: ConversationLike): ConversationDestination {
  const cid = String(conv.id);
  if (conv.type === "promoted" && typeof conv.projectId === "number") {
    return {
      kind: "workspace",
      projectId: conv.projectId,
      projectName: conv.projectName ?? null,
      conversationId: cid,
    };
  }
  return { kind: "ask-atlas", conversationId: cid };
}

export function hasBuildIntent(text: string): boolean {
  return BUILD_INTENT_RE.test(text);
}

export function buildAskAtlasHandoffSeed(
  messages: Array<{ role: string; content: string }>,
  draftFallback = "",
): string {
  const lines: string[] = [];
  for (const m of messages.slice(-6)) {
    lines.push(`${m.role === "user" ? "Me" : "Joy"}: ${m.content.trim()}`);
  }
  if (!lines.length) return draftFallback.trim();
  return [
    "Continuing from an Ask Joy thread:",
    "",
    ...lines,
    "",
    "Let's move this into the workspace and build.",
  ].join("\n");
}

/**
 * Shared handoff trigger — fire the Nexus buffer flush when a conversation
 * hands off to a project. Best-effort, never throws, never blocks navigation.
 *
 * Deduped via an in-flight lock keyed on `${conversationId ?? "_"}:${projectId}`.
 * Concurrent calls receive the same in-flight promise; repeats within the
 * settled window are swallowed. Prevents the double-fire when both the
 * project-open handler (AskAtlasSurface:247) and the CommitPill onArm
 * (AskAtlasSurface:450) trigger for the same project in quick succession.
 */
type HandoffOpts = {
  conversationId?: string | null;
  projectId: number;
  messages: Array<{ role: string; content: string }>;
  authToken?: string | null;
  limit?: number;
};

const inFlight = new Map<string, Promise<void>>();
const recentlySettled = new Map<string, number>();
const SETTLED_TTL_MS = 5000;

function handoffKey(opts: HandoffOpts): string {
  return `${opts.conversationId ?? "_"}:${opts.projectId}`;
}

export function triggerNexusHandoff(opts: HandoffOpts): Promise<void> {
  const key = handoffKey(opts);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const settledAt = recentlySettled.get(key);
  if (settledAt != null && Date.now() - settledAt < SETTLED_TTL_MS) {
    return Promise.resolve();
  }

  const { conversationId, projectId, messages, authToken, limit = 10 } = opts;
  const trimmed = messages
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));

  const promise = fetch("/api/nexus/handoff", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({
      messages: trimmed,
      projectId,
      conversationId: conversationId ?? undefined,
    }),
  })
    .then(() => undefined)
    .catch((err) => {
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[nexus-handoff] failed", err);
      }
    })
    .finally(() => {
      inFlight.delete(key);
      recentlySettled.set(key, Date.now());
      // Best-effort GC so the map doesn't grow unbounded across a long session.
      if (recentlySettled.size > 32) {
        const cutoff = Date.now() - SETTLED_TTL_MS;
        for (const [k, ts] of recentlySettled) {
          if (ts < cutoff) recentlySettled.delete(k);
        }
      }
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Canonical redirect helper — both AskAtlasSurface and home.tsx currently
 * build their own workspace URL after handoff. Route through this so the
 * source param stays consistent (`source=home-handoff`) and we have a
 * single seam to change later.
 */
export function redirectAfterHandoff(
  projectId: number,
  setLocation: (path: string) => void,
  extraParams?: Record<string, string>,
): void {
  // INT-13: every handoff navigation must seed continuation before navigate.
  seedHandoffContinuation(projectId);
  const params = new URLSearchParams({ source: "home-handoff", ...(extraParams ?? {}) });
  setLocation(`/project/${projectId}?${params.toString()}`);
}

/**
 * Navigate into a project/workspace after Ask Joy handoff.
 * Always seeds continuation so Workspace is never quiet (INT-13).
 */
export function navigateAfterAskAtlasHandoff(
  projectId: number,
  setLocation: (path: string) => void,
  opts?: {
    conversationId?: string | null;
    source?: string;
    extraParams?: Record<string, string>;
    message?: string;
  },
): void {
  seedHandoffContinuation(projectId, opts?.message);
  const source = opts?.source ?? "home-handoff";
  const params = new URLSearchParams({
    from: "home",
    source,
    ...(opts?.extraParams ?? {}),
  });
  if (opts?.conversationId) {
    setLocation(`/workspace/${opts.conversationId}?${params.toString()}`);
    return;
  }
  setLocation(`/project/${projectId}?${params.toString()}`);
}

/**
 * Open a specific Workspace output from Ask Joy without a conversation handoff.
 * Seeds `atlas-open-output-*` and navigates with `source=open-output` so Workspace
 * expands Outputs and focuses the artifact — no opening-message continuation.
 */
export function navigateToProjectOutput(
  projectId: number,
  artifactId: number | string,
  setLocation: (path: string) => void,
  opts?: { conversationId?: string | null },
): void {
  if (!projectId || projectId <= 0) return;
  try {
    sessionStorage.setItem(`atlas-open-output-${projectId}`, String(artifactId));
    sessionStorage.removeItem("atlas-opening-message");
    sessionStorage.removeItem("atlas-opening-message-project-id");
    sessionStorage.removeItem("atlas-handoff-continuation");
  } catch {
    // sessionStorage may be unavailable; navigation still proceeds.
  }
  const params = new URLSearchParams({
    from: "home",
    source: "open-output",
  });
  if (opts?.conversationId) {
    setLocation(`/workspace/${opts.conversationId}?${params.toString()}`);
    return;
  }
  setLocation(`/project/${projectId}?${params.toString()}`);
}

/**
 * INT-11: pick the live transcript for handoff / crystallize.
 * When Ask Joy is open (or holds messages), never snapshot the cleared ambient nexusChat.
 */
export function selectHandoffMessages<T>(opts: {
  preferAskAtlas: boolean;
  askAtlasMessages: T[];
  ambientMessages: T[];
}): T[] {
  if (opts.preferAskAtlas) {
    return opts.askAtlasMessages.length > 0
      ? opts.askAtlasMessages
      : opts.ambientMessages;
  }
  return opts.ambientMessages.length > 0
    ? opts.ambientMessages
    : opts.askAtlasMessages;
}

/** Default kickoff Joy receives on workspace arrival after a home/Ask Joy handoff. */
export const HANDOFF_CONTINUATION_MESSAGE =
  "Continue from where we left off — acknowledge the handoff and propose the next concrete step.";

/**
 * Seed the workspace opening-message pipeline so Joy auto-responds after
 * a homepage / Ask Joy → workspace handoff.
 *
 * Why this exists: transferring the transcript alone leaves the workspace
 * quiet (thread shows up, but no new turn starts). The workspace suppresses
 * auto-send when bridge messages already exist — unless
 * `atlas-handoff-continuation=1` is set. Every handoff entry must call this
 * before navigating; the navigateTo button path used to be the only one that did.
 */
export function seedHandoffContinuation(
  projectId: number | string,
  message: string = HANDOFF_CONTINUATION_MESSAGE,
): void {
  try {
    sessionStorage.setItem("atlas-opening-message", message);
    sessionStorage.setItem("atlas-opening-message-project-id", String(projectId));
    sessionStorage.setItem("atlas-handoff-continuation", "1");
  } catch {
    // sessionStorage may be unavailable; handoff still navigates, user can speak first.
  }
}
