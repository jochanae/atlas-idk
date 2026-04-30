import { useEffect, useRef, useState } from "react";
import { Code2, FileText, Table as TableIcon, X, Copy, Check, ChevronUp } from "lucide-react";
import type { Artifact } from "@/lib/artifacts";

type Props = {
  artifacts: Artifact[];
  /** Forces drawer fully open (e.g. user clicked an inline artifact reference) */
  forceOpen?: boolean;
  onForceOpenChange?: (open: boolean) => void;
};

type SheetState = "closed" | "peek" | "full";

const PEEK_HEIGHT = 132; // shows handle + counter + last commit card
const FULL_HEIGHT_VH = 90;

/**
 * Adaptive Artifact Drawer — the "Unified Shell" pane.
 *
 * <768px (phone, Z Fold outer): Bottom sheet with handle + counter.
 *   - default state: collapsed handle only
 *   - short pull / tap: peek (last artifact preview)
 *   - full pull / tap counter: full 90vh sheet
 *
 * >=768px (tablet, Z Fold inner, desktop): Right-side pane.
 *   - 420px wide, slides in from right when artifacts exist
 *   - never overlays chat input
 */
export function ArtifactDrawer({ artifacts, forceOpen, onForceOpenChange }: Props) {
  const [isWide, setIsWide] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : false,
  );
  const [sheetState, setSheetState] = useState<SheetState>("closed");
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartState = useRef<SheetState>("closed");

  // Track viewport for adaptive layout
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-select most recent artifact on open or when list changes
  useEffect(() => {
    if (artifacts.length === 0) {
      setActiveArtifactId(null);
      return;
    }
    const latest = artifacts[artifacts.length - 1];
    if (latest && (!activeArtifactId || !artifacts.find((a) => a.id === activeArtifactId))) {
      setActiveArtifactId(latest.id);
    }
  }, [artifacts, activeArtifactId]);

  // Sync forceOpen → sheet state (mobile) / no-op on desktop
  useEffect(() => {
    if (forceOpen) {
      if (!isWide) setSheetState("full");
    }
  }, [forceOpen, isWide]);

  const closeForced = () => {
    onForceOpenChange?.(false);
    setSheetState("closed");
  };

  const copy = async (artifact: Artifact) => {
    try {
      await navigator.clipboard.writeText(artifact.body);
      setCopiedId(artifact.id);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      // ignore
    }
  };

  if (artifacts.length === 0 && !forceOpen) return null;

  const active = artifacts.find((a) => a.id === activeArtifactId) ?? artifacts[artifacts.length - 1];

  // ============ DESKTOP / TABLET — RIGHT-SIDE PANE ============
  if (isWide) {
    return (
      <aside
        aria-label="Artifacts"
        style={{
          position: "fixed",
          top: 64, // below header
          right: 0,
          bottom: 0,
          width: "min(420px, 38vw)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur)) saturate(140%)",
          WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(140%)",
          borderLeft: "0.5px solid var(--glass-border)",
          boxShadow: "-12px 0 48px rgba(0,0,0,0.5)",
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          color: "var(--foreground)",
          animation: "atlas-pane-in 360ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <DrawerHeader count={artifacts.length} />
        <ArtifactList
          artifacts={artifacts}
          activeId={active?.id ?? null}
          onSelect={setActiveArtifactId}
        />
        <ArtifactBody
          artifact={active ?? null}
          copiedId={copiedId}
          onCopy={copy}
        />
        <DrawerStyles />
      </aside>
    );
  }

  // ============ MOBILE — BOTTOM SHEET ============
  const sheetHeight =
    sheetState === "closed" ? 36 : sheetState === "peek" ? PEEK_HEIGHT : `${FULL_HEIGHT_VH}vh`;

  const togglePeek = () => {
    setSheetState((s) => (s === "closed" ? "peek" : s === "peek" ? "full" : "closed"));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragStartState.current = sheetState;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - e.clientY; // up = positive
    if (Math.abs(delta) < 24) return;
    if (delta > 80) setSheetState("full");
    else if (delta > 24) setSheetState("peek");
    else if (delta < -80) setSheetState("closed");
    else if (delta < -24)
      setSheetState(dragStartState.current === "full" ? "peek" : "closed");
  };
  const onPointerUp = () => {
    dragStartY.current = null;
  };

  return (
    <>
      {sheetState === "full" && (
        <div
          aria-hidden
          onClick={() => setSheetState("peek")}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 39,
            animation: "atlas-fade-in 240ms ease",
          }}
        />
      )}
      <div
        aria-label="Artifacts drawer"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: sheetHeight,
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur)) saturate(150%)",
          WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(150%)",
          borderTop: "0.5px solid color-mix(in oklab, var(--accent-gold) 22%, var(--glass-border))",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow:
            "0 -2px 0 color-mix(in oklab, var(--accent-gold) 10%, transparent), 0 -18px 48px rgba(0,0,0,0.55)",
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          transition: "height 320ms cubic-bezier(0.4, 0, 0.2, 1)",
          color: "var(--foreground)",
          overflow: "hidden",
        }}
      >
        {/* Handle row — always visible, draggable */}
        <button
          type="button"
          onClick={togglePeek}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={`Artifacts (${artifacts.length}). ${sheetState === "closed" ? "Pull up to peek." : sheetState === "peek" ? "Pull up to expand." : "Pull down to collapse."}`}
          style={{
            width: "100%",
            height: 36,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
            background: "transparent",
            border: "none",
            cursor: "grab",
            touchAction: "none",
            color: "var(--foreground)",
          }}
        >
          <span style={{ width: 24 }} />
          <span
            aria-hidden
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: "color-mix(in oklab, var(--accent-gold) 55%, var(--muted-text))",
              opacity: 0.85,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--accent-gold)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--accent-gold)",
                boxShadow: "0 0 5px var(--accent-gold)",
              }}
            />
            {artifacts.length} {artifacts.length === 1 ? "item" : "items"}
          </span>
        </button>

        {sheetState !== "closed" && (
          <>
            {sheetState === "full" && (
              <button
                type="button"
                onClick={closeForced}
                aria-label="Close drawer"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 32,
                  height: 32,
                  background: "transparent",
                  border: "none",
                  color: "var(--muted-text)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                }}
              >
                <X size={16} />
              </button>
            )}

            {sheetState === "peek" ? (
              <PeekPreview
                artifact={active ?? null}
                onExpand={() => setSheetState("full")}
              />
            ) : (
              <>
                <ArtifactList
                  artifacts={artifacts}
                  activeId={active?.id ?? null}
                  onSelect={setActiveArtifactId}
                />
                <ArtifactBody
                  artifact={active ?? null}
                  copiedId={copiedId}
                  onCopy={copy}
                />
              </>
            )}
          </>
        )}
        <DrawerStyles />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function DrawerHeader({ count }: { count: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px 10px",
        borderBottom: "0.5px solid var(--glass-border)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted-text)",
        }}
      >
        Artifacts
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--accent-gold)",
          letterSpacing: "0.1em",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--accent-gold)",
            boxShadow: "0 0 5px var(--accent-gold)",
          }}
        />
        {count}
      </span>
    </div>
  );
}

function ArtifactList({
  artifacts,
  activeId,
  onSelect,
}: {
  artifacts: Artifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "10px 12px",
        overflowX: "auto",
        flexShrink: 0,
        scrollbarWidth: "none",
        borderBottom: "0.5px solid var(--glass-border)",
      }}
    >
      {artifacts.map((a) => {
        const isActive = a.id === activeId;
        const Icon = a.kind === "code" ? Code2 : a.kind === "table" ? TableIcon : FileText;
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 999,
              border: `0.5px solid ${isActive ? "var(--accent-gold)" : "var(--border)"}`,
              background: isActive
                ? "color-mix(in oklab, var(--accent-gold) 10%, var(--surface))"
                : "var(--surface)",
              color: isActive ? "var(--accent-gold)" : "var(--muted-text)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 180ms var(--ease-cinematic)",
            }}
          >
            <Icon size={11} strokeWidth={1.7} />
            {a.title}
          </button>
        );
      })}
    </div>
  );
}

function ArtifactBody({
  artifact,
  copiedId,
  onCopy,
}: {
  artifact: Artifact | null;
  copiedId: string | null;
  onCopy: (a: Artifact) => void;
}) {
  if (!artifact) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          color: "var(--muted-text)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
        }}
      >
        no artifact selected
      </div>
    );
  }
  const isCopied = copiedId === artifact.id;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "0.5px solid var(--glass-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--foreground)",
            letterSpacing: "0.04em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "70%",
          }}
        >
          {artifact.title}
        </span>
        <button
          onClick={() => onCopy(artifact)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 6,
            background: "transparent",
            border: "0.5px solid var(--border)",
            color: isCopied ? "var(--accent-gold)" : "var(--muted-text)",
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 160ms var(--ease-cinematic)",
          }}
        >
          {isCopied ? <Check size={11} /> : <Copy size={11} />}
          {isCopied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          margin: 0,
          padding: "14px 16px 20px",
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          lineHeight: 1.55,
          color: "var(--foreground)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "transparent",
        }}
      >
        {artifact.body}
      </pre>
    </div>
  );
}

function PeekPreview({
  artifact,
  onExpand,
}: {
  artifact: Artifact | null;
  onExpand: () => void;
}) {
  if (!artifact) return null;
  return (
    <button
      type="button"
      onClick={onExpand}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "8px 16px 12px",
        background: "transparent",
        border: "none",
        textAlign: "left",
        cursor: "pointer",
        color: "var(--foreground)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--accent-gold)",
          marginBottom: 4,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Latest · {artifact.title}
        <ChevronUp size={11} style={{ marginLeft: "auto", opacity: 0.7 }} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.45,
          color: "var(--muted-text)",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          whiteSpace: "pre-wrap",
        }}
      >
        {artifact.body.slice(0, 240)}
      </div>
    </button>
  );
}

function DrawerStyles() {
  return (
    <style>{`
      @keyframes atlas-pane-in {
        from { opacity: 0; transform: translateX(24px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes atlas-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `}</style>
  );
}
