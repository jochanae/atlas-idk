import { Link } from "@tanstack/react-router";

export function StubPage({ name, path }: { name: string; path: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--atlas-bg)",
        color: "var(--atlas-fg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        gap: 16,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 10,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--atlas-gold)",
          opacity: 0.7,
        }}
      >
        {path}
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.02em", margin: 0 }}>
        {name}
      </h1>
      <div
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 11,
          color: "var(--atlas-muted)",
          opacity: 0.6,
          letterSpacing: "0.06em",
        }}
      >
        Coming soon — stub placeholder
      </div>
      <Link
        to="/"
        style={{
          marginTop: 16,
          fontFamily: "var(--app-font-mono)",
          fontSize: 11,
          color: "var(--atlas-gold)",
          letterSpacing: "0.1em",
          textDecoration: "none",
        }}
      >
        ← Home
      </Link>
    </div>
  );
}
