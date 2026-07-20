/**
 * CapabilityHint — small "What files can Atlas read?" affordance.
 *
 * Reads the shared support matrix (single source of truth). Renders a
 * popover listing which types Atlas can actually understand today vs.
 * which are stored-only. Never claims capability the matrix denies.
 *
 * Drop into any composer: <CapabilityHint />
 */
import { useState } from "react";
import { ATTACHMENT_SUPPORT_MATRIX } from "@/lib/attachments/supportMatrix";

export function CapabilityHint() {
  const [open, setOpen] = useState(false);

  const model = ATTACHMENT_SUPPORT_MATRIX.filter((e) => e.capability === "model_use");
  const stored = ATTACHMENT_SUPPORT_MATRIX.filter((e) => e.capability === "storage_only");

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="What files can Atlas read?"
        style={{
          font: "inherit",
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid rgba(var(--atlas-border-rgb,80,80,80),0.45)",
          background: "transparent",
          color: "var(--atlas-muted, #a8a29e)",
          cursor: "pointer",
          lineHeight: 1.4,
        }}
      >
        What can Atlas read?
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 40,
            width: 280,
            padding: 12,
            borderRadius: 10,
            background: "rgba(var(--atlas-surface-rgb,20,20,20),0.98)",
            border: "1px solid rgba(var(--atlas-border-rgb,80,80,80),0.55)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            color: "var(--atlas-fg)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          <Section label="Atlas can read these" tone="ok">
            {model.map((e) => e.label).join(" · ")}
          </Section>
          <Section label="Stored but not analyzed" tone="warn">
            {stored.map((e) => e.label).join(" · ")}
          </Section>
          <p style={{ margin: "8px 0 0", fontSize: 10.5, opacity: 0.6 }}>
            Unsupported types are kept in Files. Atlas will tell you when it
            can't read one instead of pretending it did.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const color = tone === "ok" ? "rgba(129,199,255,0.9)" : "rgba(248,180,120,0.95)";
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 9,
          letterSpacing: "0.1em",
          color,
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ opacity: 0.9 }}>{children}</div>
    </div>
  );
}
