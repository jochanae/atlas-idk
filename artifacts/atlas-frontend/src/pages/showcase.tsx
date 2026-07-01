import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Search, Plus, Mic, Clock } from "lucide-react";
import { SectionShell, StateTile, TodoTile, Swatch } from "./showcase/primitives";
import "./showcase/showcase.css";

const TOKENS = [
  "--atlas-bg",
  "--atlas-surface",
  "--atlas-surface-alt",
  "--atlas-fg",
  "--atlas-muted",
  "--atlas-gold",
  "--atlas-gold-dim",
  "--atlas-gold-border",
  "--atlas-gold-glow",
  "--atlas-ember",
  "--atlas-phosphor",
  "--atlas-border",
  "--atlas-glass-bg",
  "--atlas-glass-border",
];

type ThemeMode = "obsidian" | "parchment";

function useLocalTheme(): [ThemeMode, (t: ThemeMode) => void] {
  const initial: ThemeMode =
    (document.documentElement.dataset.theme as ThemeMode) === "parchment"
      ? "parchment"
      : "obsidian";
  const [theme, setTheme] = useState<ThemeMode>(initial);

  useEffect(() => {
    const previous = document.documentElement.dataset.theme || "";
    document.documentElement.dataset.theme = theme === "parchment" ? "parchment" : "";
    return () => {
      document.documentElement.dataset.theme = previous;
    };
  }, [theme]);

  return [theme, setTheme];
}

const SECTIONS = [
  ["typography", "Typography"],
  ["tokens", "Color tokens"],
  ["buttons", "Buttons"],
  ["ask-atlas", "Ask Atlas states"],
  ["inputs", "Inputs"],
  ["cards", "Cards"],
  ["bubbles", "Message bubbles"],
  ["pills", "Pills & chips"],
  ["icons", "Icons"],
  ["rows", "Tables / list rows"],
  ["sheets", "Sheets & drawers"],
  ["status", "Status indicators"],
] as const;

function ShowcaseCanvas() {
  return (
    <>
      {/* Typography */}
      <SectionShell id="typography" title="Typography">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 40, fontWeight: 600, color: "var(--atlas-fg)" }}>Heading 1</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: "var(--atlas-fg)" }}>Heading 2</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: "var(--atlas-fg)" }}>Heading 3</div>
          <div style={{ fontSize: 16, color: "var(--atlas-fg)" }}>
            Body — the quick brown fox jumps over the lazy dog. 0123456789.
          </div>
          <div style={{ fontSize: 13, color: "var(--atlas-muted)" }}>Caption / secondary text</div>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 12,
              color: "var(--atlas-muted)",
            }}
          >
            mono — atlas.snapshot.v1
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--atlas-gold)",
              }}
            >
              YOU
            </span>
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--atlas-gold)",
              }}
            >
              ATLAS
            </span>
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--atlas-gold)",
              }}
            >
              PORTFOLIO THINKING · NOT BUILDING
            </span>
          </div>
        </div>
      </SectionShell>

      {/* Color tokens */}
      <SectionShell id="tokens" title="Color tokens">
        <div className="sc-grid">
          {TOKENS.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </div>
      </SectionShell>

      {/* Buttons */}
      <SectionShell id="buttons" title="Buttons">
        <div className="sc-grid">
          <StateTile caption="primary · default">
            <Button>Primary</Button>
          </StateTile>
          <StateTile caption="primary · hover" forced="hover">
            <Button>Primary</Button>
          </StateTile>
          <StateTile caption="primary · focus" forced="focus">
            <Button>Primary</Button>
          </StateTile>
          <StateTile caption="primary · active" forced="active">
            <Button>Primary</Button>
          </StateTile>
          <StateTile caption="primary · disabled" forced="disabled">
            <Button>Primary</Button>
          </StateTile>
          <StateTile caption="secondary">
            <Button variant="secondary">Secondary</Button>
          </StateTile>
          <StateTile caption="ghost">
            <Button variant="ghost">Ghost</Button>
          </StateTile>
          <StateTile caption="destructive">
            <Button variant="destructive">Danger</Button>
          </StateTile>
          <StateTile caption="outline">
            <Button variant="outline">Outline</Button>
          </StateTile>
          <StateTile caption="icon-only">
            <Button size="icon" variant="ghost" aria-label="Send">
              <Send size={16} />
            </Button>
          </StateTile>
          <StateTile caption="loading">
            <TodoTile label="button loading spinner variant" />
          </StateTile>
        </div>
      </SectionShell>

      {/* Ask Atlas states */}
      <SectionShell id="ask-atlas" title="Ask Atlas states">
        <div className="sc-grid">
          <StateTile caption="idle · dot only">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--atlas-gold)",
                  opacity: 0.6,
                }}
              />
              <span style={{ fontSize: 13, color: "var(--atlas-muted)" }}>Ask Atlas</span>
            </div>
          </StateTile>
          <StateTile caption="listening">
            <TodoTile label="listening pulse animation" />
          </StateTile>
          <StateTile caption="thinking · shimmer">
            <TodoTile label="thinking shimmer text" />
          </StateTile>
          <StateTile caption="streaming · active pill">
            <div
              className="force-target"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid var(--atlas-gold-border)",
                background: "var(--atlas-gold-dim)",
                color: "var(--atlas-gold)",
                fontFamily: "var(--app-font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--atlas-gold)",
                }}
              />
              Ask Atlas
            </div>
          </StateTile>
          <StateTile caption="completed">
            <TodoTile label="completed state" />
          </StateTile>
          <StateTile caption="error">
            <TodoTile label="error state" />
          </StateTile>
        </div>
      </SectionShell>

      {/* Inputs */}
      <SectionShell id="inputs" title="Inputs">
        <div className="sc-grid">
          <StateTile caption="input · empty">
            <Input placeholder="Placeholder…" />
          </StateTile>
          <StateTile caption="input · typing">
            <Input defaultValue="Half-typed value" />
          </StateTile>
          <StateTile caption="input · focus" forced="focus">
            <Input placeholder="Focused" />
          </StateTile>
          <StateTile caption="input · disabled" forced="disabled">
            <Input placeholder="Disabled" />
          </StateTile>
          <StateTile caption="textarea · empty">
            <Textarea placeholder="Write a message…" />
          </StateTile>
          <StateTile caption="textarea · focus" forced="focus">
            <Textarea defaultValue="Focused textarea" />
          </StateTile>
          <StateTile caption="composer shell">
            <TodoTile label="AskAtlas composer shell showcase render" />
          </StateTile>
        </div>
      </SectionShell>

      {/* Cards */}
      <SectionShell id="cards" title="Cards">
        <div className="sc-grid">
          <StateTile caption="card · default">
            <Card style={{ width: "100%" }}>
              <CardHeader>
                <CardTitle>Default</CardTitle>
              </CardHeader>
              <CardContent style={{ fontSize: 13, color: "var(--atlas-muted)" }}>
                Body copy.
              </CardContent>
            </Card>
          </StateTile>
          <StateTile caption="card · hover" forced="hover">
            <Card style={{ width: "100%" }}>
              <CardHeader>
                <CardTitle>Hover</CardTitle>
              </CardHeader>
              <CardContent style={{ fontSize: 13, color: "var(--atlas-muted)" }}>
                Body copy.
              </CardContent>
            </Card>
          </StateTile>
          <StateTile caption="card · selected" forced="selected">
            <Card style={{ width: "100%" }} className="force-target">
              <CardHeader>
                <CardTitle>Selected</CardTitle>
              </CardHeader>
              <CardContent style={{ fontSize: 13, color: "var(--atlas-muted)" }}>
                Body copy.
              </CardContent>
            </Card>
          </StateTile>
          <StateTile caption="card · dragging">
            <TodoTile label="drag ghost styling" />
          </StateTile>
        </div>
      </SectionShell>

      {/* Message bubbles */}
      <SectionShell id="bubbles" title="Message bubbles">
        <div className="sc-grid">
          <StateTile caption="user bubble">
            <div
              style={{
                padding: "10px 14px",
                border: "1px solid var(--atlas-gold-border)",
                borderRadius: 12,
                background: "transparent",
                color: "var(--atlas-fg)",
                fontSize: 13,
              }}
            >
              Hey
            </div>
          </StateTile>
          <StateTile caption="atlas plain text">
            <div style={{ color: "var(--atlas-fg)", fontSize: 14 }}>
              Hey — still here. What's up?
            </div>
          </StateTile>
          <StateTile caption="system note">
            <div
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--atlas-muted)",
              }}
            >
              Committed — 2m ago
            </div>
          </StateTile>
          <StateTile caption="streaming">
            <TodoTile label="streaming cursor + shimmer" />
          </StateTile>
          <StateTile caption="with tool result">
            <TodoTile label="tool result accordion" />
          </StateTile>
        </div>
      </SectionShell>

      {/* Pills & chips */}
      <SectionShell id="pills" title="Pills & chips">
        <div className="sc-grid">
          <StateTile caption="badge · default">
            <Badge>Default</Badge>
          </StateTile>
          <StateTile caption="badge · secondary">
            <Badge variant="secondary">Secondary</Badge>
          </StateTile>
          <StateTile caption="badge · outline">
            <Badge variant="outline">Outline</Badge>
          </StateTile>
          <StateTile caption="badge · destructive">
            <Badge variant="destructive">Error</Badge>
          </StateTile>
          <StateTile caption="memory chip">
            <TodoTile label="MemoryChip component preview" />
          </StateTile>
        </div>
      </SectionShell>

      {/* Icons */}
      <SectionShell id="icons" title="Icons">
        <div className="sc-grid">
          <StateTile caption="idle">
            <div style={{ display: "flex", gap: 12, color: "var(--atlas-muted)" }}>
              <Clock size={18} />
              <Plus size={18} />
              <Search size={18} />
              <Mic size={18} />
              <Send size={18} />
            </div>
          </StateTile>
          <StateTile caption="hover" forced="hover">
            <div style={{ display: "flex", gap: 12, color: "var(--atlas-fg)" }}>
              <Clock size={18} />
              <Plus size={18} />
              <Search size={18} />
              <Mic size={18} />
              <Send size={18} />
            </div>
          </StateTile>
          <StateTile caption="active (send armed)">
            <div style={{ color: "var(--atlas-gold)" }}>
              <Send size={18} />
            </div>
          </StateTile>
        </div>
      </SectionShell>

      {/* Rows */}
      <SectionShell id="rows" title="Tables / list rows">
        <div style={{ border: "1px solid var(--atlas-border)", borderRadius: 10, overflow: "hidden" }}>
          {["Happy · 4 msg · 3m ago", "Hey · 4 msg · 8m ago", "Hey · 2 msg · 14m ago"].map(
            (row, i) => (
              <div
                key={row}
                style={{
                  padding: "12px 16px",
                  borderBottom:
                    i < 2 ? "1px solid var(--atlas-border)" : "none",
                  fontSize: 13,
                  color: "var(--atlas-fg)",
                  background: i === 1 ? "var(--atlas-gold-dim)" : "transparent",
                }}
              >
                {row}
                {i === 1 ? (
                  <span
                    style={{
                      marginLeft: 12,
                      fontFamily: "var(--app-font-mono)",
                      fontSize: 9,
                      color: "var(--atlas-gold)",
                    }}
                  >
                    SELECTED
                  </span>
                ) : null}
              </div>
            )
          )}
        </div>
      </SectionShell>

      {/* Sheets */}
      <SectionShell id="sheets" title="Sheets & drawers">
        <div className="sc-grid">
          <StateTile caption="sheet header">
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--atlas-muted)",
                }}
              >
                Ask Atlas History
              </span>
              <Button size="sm" variant="outline">
                <Plus size={14} /> New
              </Button>
            </div>
          </StateTile>
          <StateTile caption="empty state">
            <div
              style={{
                fontSize: 13,
                color: "var(--atlas-muted)",
                textAlign: "center",
              }}
            >
              No entries yet.
            </div>
          </StateTile>
          <StateTile caption="feature drawer body">
            <TodoTile label="feature drawer body preview" />
          </StateTile>
        </div>
      </SectionShell>

      {/* Status */}
      <SectionShell id="status" title="Status indicators">
        <div className="sc-grid">
          {[
            ["Committed", "var(--atlas-gold)"],
            ["In Motion", "var(--atlas-phosphor)"],
            ["Under Consideration", "var(--atlas-muted)"],
            ["In Tension", "var(--atlas-ember)"],
            ["Overridden", "var(--atlas-muted)"],
          ].map(([label, color]) => (
            <StateTile key={label as string} caption={label as string}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: color as string,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--app-font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: color as string,
                  }}
                >
                  {label}
                </span>
              </div>
            </StateTile>
          ))}
        </div>
      </SectionShell>
    </>
  );
}

export default function Showcase() {
  const [theme, setTheme] = useLocalTheme();
  const [sideBySide, setSideBySide] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sideBySide || !syncScroll) return;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    let locked = false;
    const sync = (src: HTMLDivElement, dst: HTMLDivElement) => () => {
      if (locked) return;
      locked = true;
      dst.scrollTop = src.scrollTop;
      requestAnimationFrame(() => {
        locked = false;
      });
    };
    const l = sync(left, right);
    const r = sync(right, left);
    left.addEventListener("scroll", l);
    right.addEventListener("scroll", r);
    return () => {
      left.removeEventListener("scroll", l);
      right.removeEventListener("scroll", r);
    };
  }, [sideBySide, syncScroll]);

  // Segmented control style — one dominant selected state, others recede
  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    fontFamily: "var(--app-font-mono)",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    border: "1px solid var(--atlas-border)",
    background: active ? "var(--atlas-gold-dim)" : "transparent",
    color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
    cursor: "pointer",
    borderRadius: 6,
  });

  return (
    <div
      data-showcase-root
      style={{
        minHeight: "100vh",
        background: "var(--atlas-bg)",
        color: "var(--atlas-fg)",
        fontFamily: "var(--app-font-sans)",
      }}
    >
      {/* Sticky top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid var(--atlas-border)",
          background: "var(--atlas-glass-bg)",
          backdropFilter: "blur(10px)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--atlas-fg)",
            fontWeight: 500,
          }}
        >
          Showcase
        </div>

        {/* Theme segmented control — dominant primary role */}
        <div
          role="group"
          aria-label="Theme"
          style={{
            display: "flex",
            gap: 0,
            padding: 2,
            border: "1px solid var(--atlas-border)",
            borderRadius: 8,
            background: "var(--atlas-surface)",
          }}
        >
          <button
            type="button"
            style={{ ...segBtn(theme === "obsidian"), border: "none" }}
            onClick={() => setTheme("obsidian")}
          >
            Obsidian
          </button>
          <button
            type="button"
            style={{ ...segBtn(theme === "parchment"), border: "none" }}
            onClick={() => setTheme("parchment")}
          >
            Parchment
          </button>
        </div>

        {/* Layout toggles — secondary role, quieter */}
        <button
          type="button"
          style={segBtn(sideBySide)}
          onClick={() => setSideBySide((v) => !v)}
        >
          {sideBySide ? "Single view" : "Side by side"}
        </button>

        {sideBySide ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--atlas-muted)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={syncScroll}
              onChange={(e) => setSyncScroll(e.target.checked)}
            />
            Sync scroll
          </label>
        ) : null}

        <nav
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginLeft: "auto",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              style={{ color: "var(--atlas-muted)", textDecoration: "none" }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {sideBySide ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div
            ref={leftRef}
            data-theme=""
            style={{
              padding: 24,
              background: "#0B0A0F",
              color: "rgba(255,255,255,0.94)",
              borderRight: "1px solid rgba(255,255,255,0.1)",
              ...(syncScroll
                ? { height: "calc(100vh - 57px)", overflowY: "auto" }
                : {}),
            }}
          >
            <div
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)",
                marginBottom: 12,
              }}
            >
              Obsidian
            </div>
            <div data-showcase-root style={{ ["--atlas-bg" as any]: "#0B0A0F" }}>
              <ShowcaseCanvas />
            </div>
          </div>
          <div
            ref={rightRef}
            data-theme="parchment"
            style={{
              padding: 24,
              background: "#F7F4ED",
              color: "#0F172A",
              ...(syncScroll
                ? { height: "calc(100vh - 57px)", overflowY: "auto" }
                : {}),
            }}
          >
            <div
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#6B6560",
                marginBottom: 12,
              }}
            >
              Parchment
            </div>
            <div data-showcase-root>
              <ShowcaseCanvas />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
          <ShowcaseCanvas />
        </div>
      )}
    </div>
  );
}
