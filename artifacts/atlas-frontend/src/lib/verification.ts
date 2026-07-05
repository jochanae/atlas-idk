import type { Entry } from "@workspace/api-client-react";

export type VerifyKind = "typecheck" | "test" | "lint" | "build";

export type VerificationMeta = {
  kind: "verification";
  target: VerifyKind;
  status: "passed" | "failed";
  failingCount?: number;
  durationMs: number;
  parentRunId?: string;
  createdAt: string;
};

export type VerifyRunStatus = "never" | "passed" | "failed" | "running";

export type VerifyKindState = {
  status: VerifyRunStatus;
  failingCount?: number;
  lastRunAt?: string;
  durationMs?: number;
};

export const VERIFY_KINDS: VerifyKind[] = ["typecheck", "test", "lint", "build"];

export const VERIFY_KIND_LABELS: Record<VerifyKind, string> = {
  typecheck: "Type Check",
  test: "Tests",
  lint: "Lint",
  build: "Build",
};

export const VERIFY_KIND_ICONS: Record<VerifyKind, string> = {
  typecheck: "✓",
  test: "✓",
  lint: "✓",
  build: "✓",
};

export function parseVerificationMeta(entry: Entry): VerificationMeta | null {
  const raw = (entry as Entry & { enrichmentJson?: string | null }).enrichmentJson;
  if (raw) {
    try {
      const meta = JSON.parse(raw) as VerificationMeta;
      if (meta.kind === "verification" && meta.target) return meta;
    } catch { /* fall through */ }
  }
  if (entry.mode === "verification" && entry.title.startsWith("Verified ·")) {
    const parts = entry.title.split(" · ");
    const label = parts[1];
    const target = Object.entries(VERIFY_KIND_LABELS).find(([, v]) => v === label)?.[0] as VerifyKind | undefined;
    const status = parts[2] === "passed" || parts[2] === "failed" ? parts[2] : undefined;
    if (target && status) {
      return {
        kind: "verification",
        target,
        status,
        durationMs: 0,
        createdAt: entry.createdAt,
        ...(entry.summary?.includes("failing")
          ? { failingCount: Number(entry.summary.match(/(\d+)\s+failing/)?.[1] ?? 0) || undefined }
          : {}),
      };
    }
  }
  return null;
}

export function isVerificationEntry(entry: Entry): boolean {
  return entry.mode === "verification" || parseVerificationMeta(entry) != null;
}

export function isVerificationFailed(entry: Entry): boolean {
  const meta = parseVerificationMeta(entry);
  return meta?.status === "failed";
}

export function buildVerifyStatesFromEntries(entries: Entry[]): Record<VerifyKind, VerifyKindState> {
  const base: Record<VerifyKind, VerifyKindState> = {
    typecheck: { status: "never" },
    test: { status: "never" },
    lint: { status: "never" },
    build: { status: "never" },
  };

  const verificationEntries = entries
    .filter(isVerificationEntry)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  for (const entry of verificationEntries) {
    const meta = parseVerificationMeta(entry);
    if (!meta) continue;
    if (base[meta.target].status !== "never") continue;
    base[meta.target] = {
      status: meta.status,
      failingCount: meta.failingCount,
      lastRunAt: meta.createdAt ?? entry.createdAt,
      durationMs: meta.durationMs,
    };
  }

  return base;
}

export function relativeVerifyTime(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function statusPillText(state: VerifyKindState): string {
  if (state.status === "never") return "never";
  if (state.status === "running") return "running…";
  if (state.status === "passed") {
    const ago = relativeVerifyTime(state.lastRunAt);
    return ago ? `passed · ${ago}` : "passed";
  }
  if (state.failingCount != null) return `failed · ${state.failingCount} failing`;
  return "failed";
}

export function dispatchVerifyRun(kind: VerifyKind, projectId?: number, parentRunId?: string) {
  window.dispatchEvent(
    new CustomEvent("axiom:verify-run", {
      detail: { kind, projectId, parentRunId },
    }),
  );
}
