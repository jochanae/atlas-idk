import { useEffect, useRef, useState, type DragEvent } from "react";

export type WhisperAnswers = {
  audience: string;
  aesthetics: string;
  seedMaterial: string;
  hasAttachment: boolean;
  attachmentHint: string | null;
};

type WhisperGateProps = {
  projectName?: string | null;
  submitting: boolean;
  onSubmit: (answers: WhisperAnswers) => void;
  onSkip: () => void;
};

const STEPS = [
  {
    id: "audience",
    label: "Audience",
    question: "Who is this for, and what changes for them when it works?",
    placeholder:
      "e.g. Solo operators running 2–5 client engagements who lose continuity between sessions…",
  },
  {
    id: "aesthetics",
    label: "Aesthetics",
    question: "What should it feel like? Reference voices, brands, or textures.",
    placeholder:
      "e.g. Quiet authority. Obsidian and gold. Less Notion, more pre-flight checklist…",
  },
  {
    id: "seed",
    label: "Seed material",
    question:
      "What raw material exists today? Paste a link, describe a doc, or drop a ZIP.",
    placeholder: "e.g. Two Google Docs, a Figma file, and a half-built repo…",
  },
] as const;

export function WhisperGate({ projectName, submitting, onSubmit, onSkip }: WhisperGateProps) {
  const [step, setStep] = useState(0);
  const [audience, setAudience] = useState("");
  const [aesthetics, setAesthetics] = useState("");
  const [seedMaterial, setSeedMaterial] = useState("");
  const [hasAttachment, setHasAttachment] = useState(false);
  const [attachmentHint, setAttachmentHint] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [step]);

  const current = STEPS[step];
  const value = step === 0 ? audience : step === 1 ? aesthetics : seedMaterial;
  const setValue = step === 0 ? setAudience : step === 1 ? setAesthetics : setSeedMaterial;
  const canAdvance =
    step === 2 ? value.trim().length > 0 || hasAttachment : value.trim().length >= 8;

  const next = () => {
    if (!canAdvance) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onSubmit({
        audience: audience.trim(),
        aesthetics: aesthetics.trim(),
        seedMaterial: seedMaterial.trim(),
        hasAttachment,
        attachmentHint,
      });
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setHasAttachment(true);
      setAttachmentHint(`${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      next();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        maxWidth: 640,
        margin: "0 auto",
        padding: "24px 20px",
        gap: 24,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--accent-gold)",
            opacity: 0.7,
            marginBottom: 10,
          }}
        >
          Whisper Gate · {projectName ?? "New project"}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 300,
            color: "var(--foreground)",
            lineHeight: 1.35,
            letterSpacing: "-0.005em",
          }}
        >
          Three questions. One Compass.
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "var(--muted-text)",
            opacity: 0.85,
          }}
        >
          Atlas writes nothing until it knows where you're pointed.
        </div>
      </div>

      {/* Stepper rail */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            style={{
              height: 2,
              width: 40,
              borderRadius: 2,
              background:
                i <= step
                  ? "var(--accent-gold)"
                  : "color-mix(in oklab, var(--border) 80%, transparent)",
              opacity: i === step ? 1 : i < step ? 0.7 : 0.4,
              transition: "all 240ms var(--ease-cinematic)",
            }}
          />
        ))}
      </div>

      {/* Question card */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          border: "1px solid color-mix(in oklab, var(--accent-gold) 18%, transparent)",
          padding: "20px 20px 16px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--muted-text)",
            opacity: 0.7,
            marginBottom: 8,
          }}
        >
          {String(step + 1).padStart(2, "0")} / 03 · {current.label}
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 400,
            color: "var(--foreground)",
            lineHeight: 1.45,
            marginBottom: 14,
          }}
        >
          {current.question}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder={current.placeholder}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 14px",
            color: "var(--foreground)",
            fontSize: 14,
            lineHeight: 1.5,
            resize: "vertical",
            minHeight: 96,
            fontFamily: "inherit",
            outline: "none",
          }}
        />

        {/* Step 3 only: drop-zone shell */}
        {step === 2 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              marginTop: 12,
              border: `1px dashed ${
                dragOver
                  ? "var(--accent-gold)"
                  : "color-mix(in oklab, var(--accent-gold) 30%, var(--border))"
              }`,
              borderRadius: 10,
              padding: "16px 14px",
              textAlign: "center",
              background: dragOver
                ? "color-mix(in oklab, var(--accent-gold) 6%, transparent)"
                : "transparent",
              transition: "all 180ms var(--ease-cinematic)",
              cursor: "default",
            }}
          >
            {hasAttachment ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--accent-gold)",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.04em",
                  }}
                >
                  ◆ Recorded: {attachmentHint}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted-text)",
                    opacity: 0.7,
                  }}
                >
                  Atlas will note that source material exists. Parsing comes in v2.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHasAttachment(false);
                    setAttachmentHint(null);
                  }}
                  style={{
                    marginTop: 4,
                    background: "transparent",
                    border: "none",
                    color: "var(--muted-text)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    textDecoration: "underline",
                    opacity: 0.7,
                  }}
                >
                  remove
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted-text)",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  drop a ZIP, doc, or folder
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted-text)",
                    opacity: 0.55,
                  }}
                >
                  We'll record that source material exists. Parsing arrives next.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={step === 0 ? onSkip : back}
          disabled={submitting}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted-text)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.4 : 0.7,
            padding: "8px 4px",
          }}
        >
          {step === 0 ? "Skip for now" : "← Back"}
        </button>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-text)",
            opacity: 0.5,
            letterSpacing: "0.06em",
          }}
        >
          ⌘↵ to advance
        </div>

        <button
          type="button"
          onClick={next}
          disabled={!canAdvance || submitting}
          style={{
            background: canAdvance && !submitting ? "var(--ember)" : "var(--surface)",
            border:
              canAdvance && !submitting
                ? "none"
                : "0.5px solid var(--border)",
            color:
              canAdvance && !submitting ? "var(--background)" : "var(--muted-text)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: canAdvance && !submitting ? "pointer" : "default",
            padding: "10px 18px",
            borderRadius: 8,
            boxShadow:
              canAdvance && !submitting
                ? "0 0 16px -2px rgba(234,88,12,0.5)"
                : "none",
            transition: "all 200ms var(--ease-cinematic)",
          }}
        >
          {submitting
            ? "Drafting…"
            : step === STEPS.length - 1
              ? "Generate Compass"
              : "Next →"}
        </button>
      </div>
    </div>
  );
}
