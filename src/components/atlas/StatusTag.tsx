import type { LedgerStatus } from "@/lib/atlas";

const styles: Record<LedgerStatus, string> = {
  Active:
    "bg-[color:var(--ember)]/10 text-[color:var(--ember)] border border-[color:var(--ember)]/30",
  Superseded:
    "bg-[color:var(--surface-alt)] text-muted-foreground border border-border",
  Violated:
    "bg-[#7F1D1D]/20 text-[#FCA5A5] border border-[#7F1D1D]/60",
};

export function StatusTag({ status }: { status: LedgerStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-[3px] text-[10px] font-mono font-medium uppercase tracking-[0.08em] rounded-sm ${styles[status]}`}
    >
      {status}
    </span>
  );
}
