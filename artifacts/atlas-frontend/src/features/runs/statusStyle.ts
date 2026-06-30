import type { RunStatus } from "./types";

export function statusColors(status: RunStatus): { fg: string; bg: string; border: string; label: string } {
  switch (status) {
    case "applied":
      return {
        fg: "rgba(52,211,153,0.95)",
        bg: "rgba(52,211,153,0.10)",
        border: "rgba(52,211,153,0.35)",
        label: "APPLIED",
      };
    case "partial":
      return {
        fg: "rgba(251,191,36,0.95)",
        bg: "rgba(251,191,36,0.10)",
        border: "rgba(251,191,36,0.35)",
        label: "PARTIAL",
      };
    case "failed":
      return {
        fg: "rgba(248,113,113,0.95)",
        bg: "rgba(248,113,113,0.10)",
        border: "rgba(248,113,113,0.35)",
        label: "FAILED",
      };
    case "running":
    default:
      return {
        fg: "var(--atlas-muted, rgba(255,255,255,0.55))",
        bg: "rgba(255,255,255,0.04)",
        border: "var(--atlas-border)",
        label: "RUNNING",
      };
  }
}
