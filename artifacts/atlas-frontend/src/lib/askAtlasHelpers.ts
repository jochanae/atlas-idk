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
