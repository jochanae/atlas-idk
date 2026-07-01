import { type ReactNode, useEffect, useState } from "react";

export function SectionShell({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="sc-section">
      <h2
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--atlas-muted)",
          marginBottom: 20,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StateTile({
  caption,
  forced,
  children,
}: {
  caption: string;
  forced?: "hover" | "focus" | "active" | "disabled" | "selected";
  children: ReactNode;
}) {
  return (
    <div className="sc-tile" data-force-state={forced}>
      {forced ? (
        <span className="sc-forced-badge">Forced preview state — {forced}</span>
      ) : null}
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
      <div className="sc-caption">{caption}</div>
    </div>
  );
}

export function TodoTile({ label }: { label: string }) {
  return <div className="sc-todo">TODO — {label} (not yet built)</div>;
}

export function Swatch({ token }: { token: string }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    setValue(raw || "—");
  }, [token]);
  const isColor = /^(#|rgb|hsl|oklch|color-mix)/i.test(value);
  return (
    <div className="sc-tile">
      <div
        className="sc-swatch"
        style={{ background: isColor ? value : "transparent" }}
      />
      <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-fg)" }}>
        {token}
      </div>
      <div className="sc-caption" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}
