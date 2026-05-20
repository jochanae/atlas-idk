function atlasActivityStatus(content: string): string {
  const planStep = content.match(/PLAN_STEP:\s*(.+)/i)?.[1]?.trim();
  if (planStep) return planStep;
  if (/LINE_PATCH/i.test(content)) return "Patching code...";
  if (/FILE_EDIT/i.test(content)) return "Preparing changes...";
  if (/FILE_READ/i.test(content)) return "Reading files...";
  if (/\b(git|push)\b/i.test(content)) return "Pushing to GitHub...";
  return "Atlas is thinking...";
}

export function AtlasActivityBar({ content }: { content: string }) {
  return (
    <div
      style={{
        margin: "2px 0 18px",
        padding: "6px 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--atlas-gold) 7%, transparent)",
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 14%, transparent)",
        pointerEvents: "none",
      }}
    >
      <span
        className="atlas-pulse-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--atlas-gold)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "var(--atlas-muted)",
          textTransform: "uppercase",
        }}
      >
        {atlasActivityStatus(content)}
      </span>
    </div>
  );
}
