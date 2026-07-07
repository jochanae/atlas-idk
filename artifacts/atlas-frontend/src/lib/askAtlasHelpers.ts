const BUILD_INTENT_RE =
  /\b(let'?s build|i'?ll build|let me build|implement(?:ing|ed)?|scaffold(?:ing|ed)?|create the (?:project|workspace|file|component)|spin up|kick off the build|start building|wire (?:this )?up|generate the (?:project|code|files))\b/i;

export function hasBuildIntent(text: string): boolean {
  return BUILD_INTENT_RE.test(text);
}

export function buildAskAtlasHandoffSeed(
  messages: Array<{ role: string; content: string }>,
  draftFallback = "",
): string {
  const lines: string[] = [];
  for (const m of messages.slice(-6)) {
    lines.push(`${m.role === "user" ? "Me" : "Atlas"}: ${m.content.trim()}`);
  }
  if (!lines.length) return draftFallback.trim();
  return [
    "Continuing from an Ask Atlas thread:",
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
  const params = new URLSearchParams({ source: "home-handoff", ...(extraParams ?? {}) });
  setLocation(`/project/${projectId}?${params.toString()}`);
}
