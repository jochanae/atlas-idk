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
 * Consolidates the previously-duplicated fetch call sites in AskAtlasSurface
 * (2x) and home.tsx (1x).
 */
export function triggerNexusHandoff(opts: {
  conversationId?: string | null;
  projectId: number;
  messages: Array<{ role: string; content: string }>;
  authToken?: string | null;
  limit?: number;
}): Promise<void> {
  const { conversationId, projectId, messages, authToken, limit = 10 } = opts;
  const trimmed = messages
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));
  return fetch("/api/nexus/handoff", {
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
    });
}
