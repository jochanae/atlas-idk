// Glossary-in-Context card (§XI Phase 2).
// Renders the three answers — what it means, why it comes up, reversibility —
// with a muted reversibility badge in the obsidian/gold treatment.

export type KnowledgeEntry = {
  id: string;
  slug: string;
  term: string;
  category: string;
  one_liner: string;
  what_it_means: string | null;
  why_it_comes_up: string | null;
  reversibility: "reversible" | "partial" | "irreversible" | null;
  reversibility_label: string | null;
  what_to_do_next: string | null;
  common_mistake: string | null;
  status: string;
  usage_count: number;
};

const REVERSIBILITY_TONE: Record<string, { fg: string; dot: string; glow: string }> = {
  reversible: {
    fg: "var(--phosphor)",
    dot: "var(--phosphor)",
    glow: "rgba(6,182,212,0.35)",
  },
  partial: {
    fg: "var(--accent-gold)",
    dot: "var(--accent-gold)",
    glow: "rgba(218,165,32,0.35)",
  },
  irreversible: {
    fg: "var(--ember)",
    dot: "var(--ember)",
    glow: "rgba(234,88,12,0.4)",
  },
};

export function GlossaryCard({
  entry,
  generated,
}: {
  entry: KnowledgeEntry;
  generated?: boolean;
}) {
  const tone = REVERSIBILITY_TONE[entry.reversibility ?? "reversible"];

  return (
    <div
      style={{
        marginTop: 8,
        background: "color-mix(in oklab, var(--surface) 92%, transparent)",
        border: "0.5px solid color-mix(in oklab, var(--accent-gold) 22%, var(--border))",
        borderRadius: 10,
        padding: "12px 13px 10px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted-text)",
              opacity: 0.6,
              marginBottom: 3,
            }}
          >
            {entry.category} · Glossary{generated ? " · just minted" : ""}
          </div>
          <div
            style={{
              color: "var(--foreground)",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              lineHeight: 1.3,
            }}
          >
            {entry.term}
          </div>
        </div>
        <span
          title={entry.reversibility_label ?? ""}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 7px 2px 6px",
            borderRadius: 999,
            border: `0.5px solid ${tone.fg}`,
            background: "transparent",
            fontFamily: "var(--font-mono)",
            fontSize: 8.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: tone.fg,
            boxShadow: `0 0 8px -3px ${tone.glow}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: tone.dot,
              boxShadow: `0 0 5px ${tone.dot}`,
            }}
          />
          {entry.reversibility ?? "reversible"}
        </span>
      </div>

      {entry.one_liner && (
        <div
          style={{
            fontSize: 12,
            color: "color-mix(in oklab, var(--foreground) 80%, transparent)",
            lineHeight: 1.45,
            fontStyle: "italic",
          }}
        >
          {entry.one_liner}
        </div>
      )}

      <Section label="What it means" body={entry.what_it_means} />
      <Section label="Why it comes up" body={entry.why_it_comes_up} />
      <Section label="Reversibility" body={entry.reversibility_label} />

      {entry.what_to_do_next && (
        <div
          style={{
            marginTop: 2,
            paddingTop: 8,
            borderTop: "0.5px solid color-mix(in oklab, var(--border) 70%, transparent)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--accent-gold)",
              opacity: 0.75,
              marginBottom: 3,
            }}
          >
            Next move
          </div>
          <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.45 }}>
            {entry.what_to_do_next}
          </div>
        </div>
      )}

      {entry.common_mistake && (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-text)",
            lineHeight: 1.4,
            opacity: 0.75,
          }}
        >
          <span style={{ color: "var(--accent-gold)", opacity: 0.75 }}>◇ trap:</span>{" "}
          {entry.common_mistake}
        </div>
      )}
    </div>
  );
}

function Section({ label, body }: { label: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted-text)",
          opacity: 0.6,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.45 }}>
        {body}
      </div>
    </div>
  );
}
