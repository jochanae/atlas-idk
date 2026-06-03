function atlasActivityStatus(content: string): string {
  const narration = content.match(/^NARRATION:(.+)/)?.[1]?.trim();
  if (narration) return narration;
  const planStep = content.match(/PLAN_STEP:\s*(.+)/i)?.[1]?.trim();
  if (planStep) return planStep;
  if (/LINE_PATCH/i.test(content)) return "Patching code...";
  if (/FILE_EDIT/i.test(content)) return "Preparing changes...";
  if (/FILE_READ/i.test(content)) return "Reading files...";
  if (/\b(git|push)\b/i.test(content)) return "Pushing to GitHub...";
  return "";
}

export function AtlasActivityBar({ content }: { content: string; lens?: string }) {
  const resolved = atlasActivityStatus(content);
  const displayed = resolved || "Atlas is thinking...";

  return (
    <div
      style={{
        margin: "2px 0 18px",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 11,
          opacity: 0.65,
        }}
      >
        {displayed}
      </span>
    </div>
  );
}
