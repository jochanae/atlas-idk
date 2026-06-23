import { useEffect, useRef, useState } from "react";

// ─── detection ───────────────────────────────────────────────────────────────

export function isExecutionStream(content: string): boolean {
  if (!content) return false;
  return (
    /PLAN_STEP:/i.test(content) ||
    /FILE_EDIT/i.test(content) ||
    /LINE_PATCH/i.test(content) ||
    /SKETCH_STEP:/i.test(content) ||
    /BUILD_STEP:/i.test(content) ||
    /AUDIT_STEP:/i.test(content) ||
    (content.match(/NARRATION:/gi) ?? []).length >= 2
  );
}

// ─── parser ──────────────────────────────────────────────────────────────────

interface JournalStep {
  text: string;
  files: string[];
  done: boolean;
}

interface ChipCounts {
  terminal: number;
  plan: number;
  fileEdit: number;
  patch: number;
}

interface JournalData {
  mission: string;
  chipCounts: ChipCounts;
  totalActions: number;
  steps: JournalStep[];
}

function extractFilePath(line: string): string | null {
  const match = line.match(/"path"\s*:\s*"([^"]+)"/) ?? line.match(/path:\s*([^\s,}]+\.[a-z]{1,6})/i);
  return match ? match[1] : null;
}

function cleanMission(raw: string): string {
  return raw
    .replace(/^(narration|plan_step|sketch_step|audit_step|build_step):\s*/i, "")
    .replace(/\.\.\.$/, "")
    .trim();
}

function parseJournal(content: string): JournalData {
  const lines = content.split("\n");
  const steps: JournalStep[] = [];
  let mission = "";
  let terminalCount = 0;
  let planCount = 0;
  let fileEditCount = 0;
  let patchCount = 0;
  const pendingFiles: string[] = [];

  const flush = () => {
    if (pendingFiles.length > 0 && steps.length > 0) {
      const last = steps[steps.length - 1];
      for (const f of pendingFiles) {
        if (!last.files.includes(f)) last.files.push(f);
      }
      pendingFiles.length = 0;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const narration = line.match(/^NARRATION:\s*(.+)/i)?.[1];
    if (narration) {
      flush();
      const text = cleanMission(narration);
      if (!mission) mission = text;
      steps.push({ text, files: [], done: false });
      planCount++;
      continue;
    }

    const planStep = line.match(/^PLAN_STEP:\s*(.+)/i)?.[1];
    if (planStep) {
      flush();
      const text = cleanMission(planStep);
      if (!mission) mission = text;
      steps.push({ text, files: [], done: false });
      planCount++;
      continue;
    }

    const sketchStep = line.match(/^SKETCH_STEP:\s*(.+)/i)?.[1];
    if (sketchStep) {
      flush();
      const text = cleanMission(sketchStep);
      if (!mission) mission = text;
      steps.push({ text, files: [], done: false });
      planCount++;
      continue;
    }

    const buildStep = line.match(/^(BUILD_STEP|AUDIT_STEP):\s*(.+)/i)?.[2];
    if (buildStep) {
      flush();
      const text = cleanMission(buildStep);
      if (!mission) mission = text;
      steps.push({ text, files: [], done: false });
      planCount++;
      continue;
    }

    if (/FILE_EDIT/i.test(line)) {
      const fp = extractFilePath(line);
      if (fp) pendingFiles.push(fp);
      fileEditCount++;
      continue;
    }

    if (/LINE_PATCH/i.test(line)) {
      const fp = extractFilePath(line);
      if (fp) pendingFiles.push(fp);
      patchCount++;
      continue;
    }

    if (/FILE_READ/i.test(line)) {
      continue;
    }

    if (/\b(build|compil|bundl|install|npm|yarn|pnpm|node|tsc)\b/i.test(line)) {
      terminalCount++;
      continue;
    }

    if (/\b(git|push|commit|branch|pr|pull)\b/i.test(line)) {
      terminalCount++;
      continue;
    }
  }

  flush();

  // Mark all but last step as done while streaming
  for (let i = 0; i < steps.length - 1; i++) {
    steps[i].done = true;
  }

  const totalActions = planCount + fileEditCount + patchCount + terminalCount;

  return {
    mission: mission || "Running operation",
    chipCounts: { terminal: terminalCount, plan: planCount, fileEdit: fileEditCount, patch: patchCount },
    totalActions,
    steps,
  };
}

// ─── chip helpers ────────────────────────────────────────────────────────────

const EJ_CSS = `
@keyframes ejGoldPulse {
  0%,100% { opacity:0.55; }
  50%      { opacity:0.95; }
}
@keyframes ejFadeSlide {
  from { opacity:0; transform:translateY(3px); }
  to   { opacity:1; transform:translateY(0);   }
}
@keyframes ejOrbitSpin {
  from { transform:rotate(0deg); }
  to   { transform:rotate(360deg); }
}
@keyframes ejCorePulse {
  0%,100% { box-shadow:0 0 4px rgba(201,162,76,0.5),0 0 10px rgba(201,162,76,0.25); }
  50%     { box-shadow:0 0 8px rgba(201,162,76,0.9),0 0 18px rgba(201,162,76,0.45); }
}
.ej-orbit-wrap { position:relative; width:14px; height:14px; flex-shrink:0; }
.ej-orbit-ring { position:absolute; inset:0; border-radius:50%; border:1px solid rgba(201,162,76,0.15); animation:ejOrbitSpin 4s linear infinite; }
.ej-orbit-ring::before { content:''; position:absolute; top:-1.5px; left:50%; width:2px; height:2px; margin-left:-1px; border-radius:50%; background:rgba(201,162,76,0.9); box-shadow:0 0 5px rgba(201,162,76,0.7); }
.ej-orbit-ring--inner { inset:3.5px; border-color:rgba(201,162,76,0.08); animation-duration:2.6s; animation-direction:reverse; }
.ej-orbit-ring--inner::before { width:1.5px; height:1.5px; margin-left:-0.75px; top:-0.75px; }
.ej-orbit-core { position:absolute; top:50%; left:50%; width:3.5px; height:3.5px; margin:-1.75px 0 0 -1.75px; border-radius:50%; background:var(--atlas-gold,#C9A24C); animation:ejCorePulse 2.8s ease-in-out infinite; }
.ej-step-row { animation:ejFadeSlide 280ms ease-out; }
`;

function EjOrbit() {
  return (
    <span className="ej-orbit-wrap" aria-hidden>
      <span className="ej-orbit-ring" />
      <span className="ej-orbit-ring ej-orbit-ring--inner" />
      <span className="ej-orbit-core" />
    </span>
  );
}

// ─── file capsule ─────────────────────────────────────────────────────────────

function FileCapsule({ path }: { path: string }) {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? path;
  const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
  return (
    <span
      title={path}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px 1px 5px",
        borderRadius: 999,
        background: "rgba(201,162,76,0.06)",
        border: "0.5px solid rgba(201,162,76,0.18)",
        fontFamily: "var(--app-font-mono)",
        fontSize: 9.5,
        color: "rgba(201,162,76,0.65)",
        whiteSpace: "nowrap",
        maxWidth: 220,
        overflow: "hidden",
        textOverflow: "ellipsis",
        lineHeight: 1.5,
      }}
    >
      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
        <path d="M2 1h5l3 3v7H2V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {dir ? (
        <>
          <span style={{ opacity: 0.4, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>{dir}</span>
          <span style={{ opacity: 0.85, flexShrink: 0 }}>{name}</span>
        </>
      ) : (
        <span style={{ opacity: 0.85 }}>{name}</span>
      )}
    </span>
  );
}

// ─── action chip ─────────────────────────────────────────────────────────────

function ActionChip({ icon, label, active }: { icon: string; label?: string; active?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 4,
        background: active ? "rgba(201,162,76,0.08)" : "rgba(255,255,255,0.03)",
        border: `0.5px solid ${active ? "rgba(201,162,76,0.22)" : "rgba(255,255,255,0.07)"}`,
        fontFamily: "var(--app-font-mono)",
        fontSize: 9.5,
        color: active ? "rgba(201,162,76,0.75)" : "rgba(255,255,255,0.3)",
        lineHeight: 1.6,
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ fontSize: 9 }}>{icon}</span>
      {label && <span>{label}</span>}
    </span>
  );
}

// ─── step row ────────────────────────────────────────────────────────────────

function StepRow({
  step,
  isLast,
  isStreaming,
}: {
  step: JournalStep;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const active = isLast && isStreaming;
  const done = step.done || (!active && !isStreaming);

  return (
    <div className="ej-step-row" style={{ marginBottom: step.files.length > 0 ? 6 : 3 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 7,
        }}
      >
        {/* status dot */}
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            marginTop: 3,
            width: 12,
            textAlign: "center",
            fontFamily: "var(--app-font-mono)",
            fontSize: 9,
            lineHeight: 1,
            color: done ? "rgba(52,211,153,0.75)" : active ? "rgba(201,162,76,0.9)" : "rgba(255,255,255,0.22)",
            animation: active ? "ejGoldPulse 2s ease-in-out infinite" : "none",
          }}
        >
          {done ? "✓" : active ? "→" : "·"}
        </span>

        {/* text */}
        <span
          style={{
            fontFamily: "var(--app-font-sans)",
            fontSize: 12,
            lineHeight: 1.5,
            color: done
              ? "rgba(255,255,255,0.55)"
              : active
              ? "rgba(255,255,255,0.82)"
              : "rgba(255,255,255,0.35)",
            transition: "color 180ms ease",
            wordBreak: "break-word",
          }}
        >
          {step.text}
        </span>
      </div>

      {/* file capsules */}
      {step.files.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            paddingLeft: 19,
            marginTop: 4,
          }}
        >
          {step.files.map((f) => (
            <FileCapsule key={f} path={f} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ExecutionJournal({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const journal = parseJournal(content);
  const prevIsStreamingRef = useRef(isStreaming);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      setExiting(true);
      const t = setTimeout(() => setExiting(false), 500);
      prevIsStreamingRef.current = isStreaming;
      return () => clearTimeout(t);
    }
    prevIsStreamingRef.current = isStreaming;
    return undefined;
  }, [isStreaming]);

  const chips: Array<{ icon: string; label: string; active: boolean }> = [];
  if (journal.chipCounts.plan > 0) chips.push({ icon: "🧠", label: `${journal.chipCounts.plan}`, active: true });
  if (journal.chipCounts.fileEdit > 0 || journal.chipCounts.patch > 0) {
    const n = journal.chipCounts.fileEdit + journal.chipCounts.patch;
    chips.push({ icon: "✎", label: `${n}`, active: true });
  }
  if (journal.chipCounts.terminal > 0) chips.push({ icon: ">_", label: `${journal.chipCounts.terminal}`, active: true });
  if (journal.totalActions > 0) chips.push({ icon: "↻", label: `${journal.totalActions} actions`, active: false });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Execution journal"
      style={{
        position: "relative",
        margin: "2px 0 16px",
        opacity: exiting ? 0 : 1,
        transition: "opacity 400ms ease",
        maxWidth: "88%",
      }}
    >
      <style>{EJ_CSS}</style>

      {/* gold left trace */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 6,
          bottom: isStreaming ? 0 : 6,
          width: 1.5,
          background: isStreaming
            ? "linear-gradient(to bottom, rgba(201,162,76,0.6), rgba(201,162,76,0.18) 70%, transparent)"
            : "rgba(201,162,76,0.25)",
          borderRadius: 1,
          transition: "background 400ms ease",
        }}
      />

      {/* content panel */}
      <div
        style={{
          paddingLeft: 16,
          paddingRight: 12,
          paddingTop: 6,
          paddingBottom: isStreaming ? 28 : 8,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* mission row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 7,
          }}
        >
          {isStreaming ? (
            <EjOrbit />
          ) : (
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(52,211,153,0.65)",
                fontSize: 10,
              }}
            >
              ✓
            </span>
          )}
          <span
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "rgba(201,162,76,0.45)",
              lineHeight: 1,
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {journal.mission}
          </span>
        </div>

        {/* action chips */}
        {chips.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 10,
            }}
          >
            {chips.map((c, i) => (
              <ActionChip key={i} icon={c.icon} label={c.label} active={c.active} />
            ))}
          </div>
        )}

        {/* checkpoints */}
        {journal.steps.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {journal.steps.map((step, i) => (
              <StepRow
                key={i}
                step={step}
                isLast={i === journal.steps.length - 1}
                isStreaming={isStreaming}
              />
            ))}
          </div>
        )}

        {/* streaming gradient fade at bottom */}
        {isStreaming && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 28,
              background:
                "linear-gradient(to bottom, transparent, var(--atlas-bg, #0a0a0c))",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── LedgerSurface (completed execution message) ─────────────────────────────

function parseLedgerContent(raw: string): {
  label: string;
  detail: string;
  files: string[];
} {
  // Strip known prefixes
  const body = raw
    .replace(/^\[FILE_COMMITTED\]\s*/i, "")
    .replace(/^\[LOCAL_APPLY_SUCCESS\]\s*/i, "")
    .trim();

  // Extract file paths — comma-separated or newline-separated
  const lines = body.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
  const files: string[] = [];
  const others: string[] = [];

  for (const l of lines) {
    // Looks like a file path if it has a slash or a common extension
    if (/\//.test(l) || /\.\w{2,6}$/.test(l)) {
      files.push(l);
    } else {
      others.push(l);
    }
  }

  const label = raw.startsWith("[FILE_COMMITTED]") ? "Committed" : "Applied";
  const detail = others.join(" ").trim();

  return { label, detail, files };
}

export function LedgerSurface({ content }: { content: string }) {
  const { label, detail, files } = parseLedgerContent(content);

  return (
    <div
      role="status"
      aria-label={`${label} — execution complete`}
      style={{
        position: "relative",
        maxWidth: "82%",
        margin: "4px 0 18px",
      }}
    >
      {/* thin left trace, completed state */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 4,
          bottom: 4,
          width: 1.5,
          background: "rgba(201,162,76,0.22)",
          borderRadius: 1,
        }}
      />

      <div style={{ paddingLeft: 14 }}>
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: files.length > 0 ? 6 : 0,
          }}
        >
          <span
            aria-hidden
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              color: "rgba(52,211,153,0.7)",
            }}
          >
            ✓
          </span>
          <span
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(201,162,76,0.45)",
              lineHeight: 1,
            }}
          >
            {label}
          </span>
          {detail && (
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 9.5,
                color: "rgba(255,255,255,0.28)",
                lineHeight: 1,
              }}
            >
              · {detail}
            </span>
          )}
        </div>

        {/* file capsules */}
        {files.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {files.map((f) => (
              <FileCapsule key={f} path={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
