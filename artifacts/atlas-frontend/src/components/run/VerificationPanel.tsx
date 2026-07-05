import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Entry } from "@workspace/api-client-react";
import { getListEntriesQueryKey } from "@workspace/api-client-react";
import { useVerifyStream } from "@/hooks/useVerifyStream";
import {
  VERIFY_KINDS,
  VERIFY_KIND_LABELS,
  VERIFY_KIND_ICONS,
  buildVerifyStatesFromEntries,
  statusPillText,
  type VerifyKind,
  type VerifyKindState,
  dispatchVerifyRun,
} from "@/lib/verification";

type OutputKind = "output" | "stderr" | "system" | "input" | "error";

export interface VerificationPanelProps {
  projectId?: number;
  entries?: Entry[];
  onOutput: (text: string, kind: OutputKind) => void;
  onRunStart?: () => void;
}

function pillColors(state: VerifyKindState, isParchment: boolean) {
  if (state.status === "passed") {
    return {
      bg: "rgba(52,211,153,0.12)",
      border: "rgba(52,211,153,0.35)",
      color: "#34d399",
    };
  }
  if (state.status === "failed") {
    return {
      bg: "rgba(252,100,100,0.10)",
      border: "rgba(252,100,100,0.30)",
      color: isParchment ? "rgba(170,30,30,0.9)" : "rgba(252,100,100,0.88)",
    };
  }
  if (state.status === "running") {
    return {
      bg: "rgba(201,162,76,0.12)",
      border: "rgba(201,162,76,0.35)",
      color: "var(--atlas-gold)",
    };
  }
  return {
    bg: isParchment ? "rgba(100,70,40,0.08)" : "rgba(255,255,255,0.04)",
    border: isParchment ? "rgba(160,130,90,0.22)" : "rgba(var(--atlas-muted-rgb),0.18)",
    color: isParchment ? "rgba(100,70,40,0.55)" : "rgba(var(--atlas-muted-rgb),0.55)",
  };
}

export function VerificationPanel({
  projectId,
  entries = [],
  onOutput,
  onRunStart,
}: VerificationPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const [localStates, setLocalStates] = useState<Record<VerifyKind, VerifyKindState> | null>(null);

  const baseStates = useMemo(() => buildVerifyStatesFromEntries(entries), [entries]);

  const { runningKind, run, applyRunningToStates } = useVerifyStream({
    onStart: (kind) => {
      onRunStart?.();
      onOutput(`$ verify ${kind}`, "input");
      setLocalStates((prev) => applyRunningToStates(prev ?? baseStates, kind));
    },
    onOutput: (line) => {
      onOutput(line.text, line.stream === "stderr" ? "stderr" : "output");
    },
    onDone: (result) => {
      const label = VERIFY_KIND_LABELS[result.kind];
      const summary = result.status === "passed"
        ? `✔ ${label} passed (${(result.durationMs / 1000).toFixed(1)}s)`
        : `✕ ${label} failed${result.failingCount != null ? ` · ${result.failingCount} failing` : ""}`;
      onOutput(summary, result.status === "passed" ? "system" : "error");
      setLocalStates((prev) => ({
        ...(prev ?? baseStates),
        [result.kind]: {
          status: result.status,
          failingCount: result.failingCount,
          lastRunAt: new Date().toISOString(),
          durationMs: result.durationMs,
        },
      }));
      if (projectId != null) {
        void queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(projectId, {}) });
      }
    },
  });

  const states = applyRunningToStates(localStates ?? baseStates, runningKind);

  const handleRun = useCallback(async (kind: VerifyKind, parentRunId?: string) => {
    if (!projectId || runningKind) return;
    await run(kind, projectId, parentRunId);
  }, [projectId, run, runningKind]);

  const handleRunAll = useCallback(async () => {
    if (!projectId || runningKind) return;
    setExpanded(true);
    for (const kind of VERIFY_KINDS) {
      await run(kind, projectId);
    }
  }, [projectId, run, runningKind]);

  // Listen for global verify-run events (Atlas inline chips, BUILD card actions)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ kind?: VerifyKind; projectId?: number; parentRunId?: string }>).detail ?? {};
      const kind = detail.kind;
      const pid = detail.projectId ?? projectId;
      if (!kind || !pid) return;
      void handleRun(kind, detail.parentRunId);
    };
    window.addEventListener("axiom:verify-run", handler);
    return () => window.removeEventListener("axiom:verify-run", handler);
  }, [handleRun, projectId]);

  // Sync local state when entries refresh from server
  useEffect(() => {
    if (!runningKind) setLocalStates(null);
  }, [entries, runningKind]);

  const isParchment = typeof document !== "undefined"
    && document.documentElement.getAttribute("data-theme") === "parchment";

  const borderColor = isParchment ? "rgba(160,130,90,0.28)" : "var(--atlas-surface)";

  return (
    <div style={{
      borderBottom: `1px solid ${borderColor}`,
      flexShrink: 0,
      background: isParchment
        ? "linear-gradient(180deg, rgba(240,228,210,0.35), transparent 80%)"
        : "linear-gradient(180deg, color-mix(in oklab, var(--atlas-gold) 4%, transparent), transparent 70%)",
    }}>
      {(() => {
        const counts = VERIFY_KINDS.reduce(
          (acc, k) => {
            const s = states[k].status;
            if (s === "passed") acc.passed++;
            else if (s === "failed") acc.failed++;
            else if (s === "running") acc.running++;
            else acc.never++;
            return acc;
          },
          { passed: 0, failed: 0, running: 0, never: 0 },
        );
        const summary = runningKind
          ? `running ${VERIFY_KIND_LABELS[runningKind]}…`
          : counts.failed > 0
            ? `✕ ${counts.failed} failing · ✓ ${counts.passed} · ${counts.never} never`
            : counts.passed === VERIFY_KINDS.length
              ? `✓ all ${counts.passed} checks passed`
              : counts.never === VERIFY_KINDS.length
                ? `${VERIFY_KINDS.length} checks · never run`
                : `✓ ${counts.passed} · ${counts.never} never`;
        const disabledAll = !projectId || !!runningKind;
        return (
          <div style={{ padding: "8px 13px", display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{
                width: 10,
                display: "inline-block",
                transition: "transform 120ms ease",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                color: isParchment ? "#8B5E3C" : "rgba(201,162,76,0.72)",
                fontSize: 10,
              }}>▶</span>
              <span style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-micro)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: isParchment ? "#8B5E3C" : "rgba(201,162,76,0.72)",
              }}>
                Verification
              </span>
              <span style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-tiny)",
                letterSpacing: "0.04em",
                color: counts.failed > 0
                  ? (isParchment ? "rgba(170,30,30,0.85)" : "rgba(252,100,100,0.85)")
                  : isParchment ? "rgba(100,70,40,0.6)" : "rgba(var(--atlas-muted-rgb),0.6)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                flex: 1,
              }}>
                {summary}
              </span>
            </button>
            <button
              type="button"
              disabled={disabledAll}
              onClick={() => void handleRunAll()}
              style={{
                flexShrink: 0,
                padding: "4px 10px",
                borderRadius: 5,
                border: `1px solid ${disabledAll ? borderColor : "rgba(201,162,76,0.45)"}`,
                background: disabledAll ? "transparent" : "color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
                color: disabledAll ? "rgba(var(--atlas-muted-rgb),0.4)" : "var(--atlas-gold)",
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-tiny)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: disabledAll ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {runningKind ? "…" : "Run all"}
            </button>
          </div>
        );
      })()}

      {expanded && <div style={{ padding: "0 13px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {VERIFY_KINDS.map((kind) => {
          const state = states[kind];
          const pill = pillColors(state, !!isParchment);
          const disabled = !projectId || !!runningKind;

          return (
            <div
              key={kind}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                background: isParchment ? "rgba(240,228,210,0.25)" : "rgba(255,255,255,0.02)",
              }}
            >
              <span style={{
                width: 18,
                flexShrink: 0,
                textAlign: "center",
                fontSize: 11,
                color: state.status === "passed" ? "#34d399" : state.status === "failed" ? pill.color : "var(--atlas-muted)",
                opacity: state.status === "never" ? 0.4 : 1,
              }}>
                {VERIFY_KIND_ICONS[kind]}
              </span>

              <span style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-xs)",
                letterSpacing: "0.04em",
                color: isParchment ? "#2A1A0E" : "var(--atlas-fg)",
                flexShrink: 0,
                minWidth: 72,
              }}>
                {VERIFY_KIND_LABELS[kind]}
              </span>

              <span style={{
                marginLeft: "auto",
                padding: "2px 8px",
                borderRadius: 999,
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-tiny)",
                letterSpacing: "0.06em",
                background: pill.bg,
                border: `0.5px solid ${pill.border}`,
                color: pill.color,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 140,
              }}>
                {statusPillText(state)}
              </span>

              <button
                type="button"
                disabled={disabled}
                onClick={() => void handleRun(kind)}
                style={{
                  flexShrink: 0,
                  padding: "4px 10px",
                  borderRadius: 5,
                  border: `1px solid ${disabled ? borderColor : "rgba(201,162,76,0.45)"}`,
                  background: disabled ? "transparent" : "color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
                  color: disabled ? "rgba(var(--atlas-muted-rgb),0.4)" : "var(--atlas-gold)",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: "var(--ts-tiny)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {runningKind === kind ? "…" : "Run"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { dispatchVerifyRun };
