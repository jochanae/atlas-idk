type AuditState = "healthy" | "warning";

export function FooterAuditLine({ state = "healthy" }: { state?: AuditState }) {
  const color =
    state === "warning" ? "var(--warning)" : "var(--phosphor)";
  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-[2px] z-50 transition-colors duration-300"
      style={{ background: color }}
      aria-hidden
    />
  );
}
