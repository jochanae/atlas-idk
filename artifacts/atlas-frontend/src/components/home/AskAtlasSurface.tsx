/**
 * AskAtlasSurface — standalone Ask Atlas chat surface.
 *
 * Owns its own fixed-overlay layout, isolated scroll container, and a
 * minimal composer. No `askAtlasSurfaceOpen` ternaries, no shared scroll
 * with the ambient home shell. Renders only when `open` is true.
 *
 * Layout invariants:
 *   - Fixed positioning below the page header (--atlas-header-height)
 *   - Scroll lives ONLY inside `.atlas-ask-atlas-scroll`
 *   - Composer is pinned to the bottom edge (above the safe-area inset)
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { type NexusHandoffSignal } from "@/hooks/useNexusChatStream";
import { useLocation } from "wouter";
import { useThemeMode } from "@/lib/theme";
import { GenesisCard } from "./GenesisCard";
import { AskAtlasRenderer } from "./AskAtlasRenderer";
import { ComposerActions, type ComposerMenuAction } from "@/components/composer/ComposerActions";
import { ensureComposerAuraCSS, getAuraVars } from "@/lib/composerAura";
import InlineSketchOffer from "@/components/chat/InlineSketchOffer";
import { type LiveStep } from "@/components/workspace/StepProgress";
import SketchReveal from "@/components/chat/SketchReveal";
import { DeepDiveSheet } from "@/components/DeepDiveSheet";
import { ParkSheet } from "@/components/ParkSheet";

import { useSmartAutoScroll } from "@/hooks/useSmartAutoScroll";
import { followScrollIfNearBottom } from "@/lib/textPacer";
import { CommitPill } from "./CommitPill";
import { setFeeder } from "@/lib/feederStore";
import { useIsTinyMobile } from "@/hooks/use-mobile";


export type AskAtlasMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "genesis";
  genesisData?: { projectName: string; timestamp: string };
  streaming?: boolean;
  createdAt?: string;
  imageUrl?: string;
  pendingSketch?: boolean;
  attachments?: Array<{ base64: string; mediaType: string; name?: string }>;
  navigateTo?: { route: string; projectId?: number; projectName?: string | null } | null;
};

export type { LiveStep as AskAtlasLiveStep } from "@/components/workspace/StepProgress";

type AskAtlasProject = {
  id: number;
  name: string;
};

interface Props {
  open: boolean;
  messages: AskAtlasMessage[];
  projects: AskAtlasProject[];
  conversationId?: string | null;
  input: string;
  setInput: (v: string) => void;
  hasAttachments?: boolean;
  onSubmit: () => void | Promise<void>;
  isSending: boolean;
  isStreaming: boolean;
  pendingPhrase: string;
  liveStep?: LiveStep;
  isListening: boolean;
  toggleVoice: () => void;
  onOpenHistory: () => void | Promise<void>;
  onCreateProject?: (nameOverride?: string) => void;
  onAddAsset?: () => void;
  onMore?: () => void;
  onFiles?: (files: File[]) => void;
  onMenuAction?: (action: ComposerMenuAction) => void;
  onSketch?: (prompt: string) => void;
  attachedFiles?: File[];
  onRemoveFile?: (index: number) => void;
  focusChip?: ReactNode;
  subheader?: ReactNode;
  /** When true, hides the surface's own composer so the home dock acts as the sole input. */
  hideComposer?: boolean;
  /** When set, the folder+plus button glows gold to indicate a workspace is ready to open. */
  handoffSignal?: NexusHandoffSignal | null;
}

const ASK_ATLAS_PLACEHOLDERS = [
  "Ask the global view…",
  "What's conflicting across projects…",
  "Which project is most worth doing next…",
  "Where are decisions stalling…",
  "What pattern keeps repeating…",
];

const PROJECT_OPEN_INTENT_RE = /\b(go|jump|open|workspace|inside)\b|\binto\s+that\b/i;
const NAVIGATE_TO_RE = /\bNAVIGATE_TO:\s*(\{[^\n]+\})/;

function renderMessageImages(msg: AskAtlasMessage) {
  const images = msg.attachments && msg.attachments.length > 0
    ? msg.attachments
    : (msg.imageUrl ? [{ mediaType: "", base64: "", name: undefined, _url: msg.imageUrl }] as Array<{
        mediaType: string;
        base64: string;
        name?: string;
        _url?: string;
      }> : []);

  if (images.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: msg.content ? 8 : 0 }}>
      {images.map((img, idx) => {
        const url = (img as { _url?: string })._url ?? `data:${img.mediaType};base64,${img.base64}`;
        return (
          <div key={idx} style={{ position: "relative" }}>
            <img
              src={url}
              alt={img.name || "Attached"}
              style={{
                width: images.length === 1 ? "100%" : 110,
                maxWidth: "100%",
                height: images.length === 1 ? "auto" : 110,
                maxHeight: images.length === 1 ? 320 : 110,
                objectFit: "cover",
                borderRadius: 8,
                display: "block",
                border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 25%, transparent)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

type NavigateTarget = { projectId: number; projectName: string } | null;

function extractNavigateTo(content: string): { target: NavigateTarget; cleanContent: string } {
  const match = content.match(NAVIGATE_TO_RE);
  if (!match) return { target: null, cleanContent: content };
  try {
    const parsed = JSON.parse(match[1]) as { projectId?: unknown; projectName?: unknown };
    if (typeof parsed.projectId === "number" && typeof parsed.projectName === "string") {
      const cleanContent = content.replace(NAVIGATE_TO_RE, "").replace(/\n{3,}/g, "\n\n").trim();
      return { target: { projectId: parsed.projectId, projectName: parsed.projectName }, cleanContent };
    }
  } catch {}
  return { target: null, cleanContent: content };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findProjectOpenTarget(content: string, projects: AskAtlasProject[]) {
  if (!PROJECT_OPEN_INTENT_RE.test(content)) return null;

  for (const project of projects) {
    const name = project.name.trim();
    if (!name) continue;
    const nameRe = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}(?=$|[^a-z0-9])`, "i");
    if (nameRe.test(content)) return project;
  }

  return null;
}

// Mirror of home.tsx's useTypewriter — same cadence so the surface feels native.
function useTypewriter(phrases: string[], paused: boolean) {
  const [display, setDisplay] = useState("");
  const state = useRef({ phraseIdx: 0, charIdx: 0, phase: "typing" as "typing" | "erasing" });
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      const s = state.current;
      const phrase = phrasesRef.current[s.phraseIdx];
      if (s.phase === "typing") {
        if (s.charIdx < phrase.length) {
          s.charIdx++;
          setDisplay(phrase.slice(0, s.charIdx));
          timer = setTimeout(tick, 38);
        } else {
          timer = setTimeout(() => {
            s.phase = "erasing";
            tick();
          }, 2000);
        }
      } else {
        if (s.charIdx > 0) {
          s.charIdx--;
          setDisplay(phrase.slice(0, s.charIdx));
          timer = setTimeout(tick, 22);
        } else {
          s.phraseIdx = (s.phraseIdx + 1) % phrasesRef.current.length;
          s.phase = "typing";
          timer = setTimeout(tick, 200);
        }
      }
    }

    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [paused]);

  return display;
}

export function AskAtlasSurface({
  open,
  messages,
  projects,
  conversationId,
  input,
  setInput,
  hasAttachments = false,
  onSubmit,
  isSending,
  isStreaming,
  pendingPhrase,
  liveStep,
  isListening,
  toggleVoice,
  onOpenHistory,
  onCreateProject,
  onAddAsset,
  onMore,
  onFiles,
  onMenuAction,
  onSketch,
  attachedFiles = [],
  onRemoveFile,
  focusChip,
  subheader,
  hideComposer = false,
  handoffSignal,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [, setLocation] = useLocation();
  const [focused, setFocused] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showParkSheet, setShowParkSheet] = useState(false);
  const [deepDiveContext, setDeepDiveContext] = useState("");
  const isParchment = useThemeMode() === "parchment";
  const filePreviewUrls = useRef<Map<File, string>>(new Map());
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [dismissedNavIdx, setDismissedNavIdx] = useState<Set<number>>(new Set());
  const isTiny = useIsTinyMobile();

  // Manage object URLs for image previews
  useEffect(() => { ensureComposerAuraCSS(); }, []);

  useEffect(() => {
    const current = new Set(attachedFiles);
    for (const [file, url] of filePreviewUrls.current.entries()) {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        filePreviewUrls.current.delete(file);
      }
    }
    for (const file of attachedFiles) {
      if (file.type.startsWith("image/") && !filePreviewUrls.current.has(file)) {
        filePreviewUrls.current.set(file, URL.createObjectURL(file));
      }
    }
  }, [attachedFiles]);

  // Smart Anchor auto-scroll — stick to bottom only if user is already near bottom.
  // If they scrolled up to re-read, freeze; don't yank them back during streaming.
  useSmartAutoScroll(scrollRef, [messages.length, isStreaming], {
    enabled: open,
    // Force-jump only when message count increments (new turn), not on every streaming tick.
    forceDeps: [messages.length],
  });

  // Follow scroll during streaming — fires on every token so the view tracks
  // the growing bubble instead of jumping when streaming ends.
  useEffect(() => {
    if (!isStreaming) return;
    followScrollIfNearBottom(scrollRef.current, 160);
  }, [messages, isStreaming]);


  const hasInput = input.length > 0;
  const showPlaceholder = open && !hasInput && !focused && messages.length === 0;
  const typed = useTypewriter(ASK_ATLAS_PLACEHOLDERS, !showPlaceholder);

  if (!open) return null;

  const canSubmit = (input.trim().length > 0 || hasAttachments) && !isSending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSubmit();
  };

  const handleProjectOpen = async (projectId: number) => {
    const route = `/project/${projectId}`;

    try {
      await fetch("/api/nexus/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: messages.slice(-10),
          projectId,
          conversationId,
        }),
      });
    } catch {
      // Handoff is best-effort; navigation should still feel immediate on failure.
    }

    setLocation(route);
  };

  const handleCopy = (content: string, idx: number) => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On touch devices the on-screen keyboard's "return" should always insert
    // a newline — never submit. Desktop keeps Enter=send, Shift+Enter=newline.
    const isTouch =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    if (isTouch) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };




  return (
    <div
      className="atlas-ask-atlas-surface"
      role="dialog"
      aria-label="Ask Atlas"
      style={{
        position: "fixed",
        top: "var(--atlas-header-height, 56px)",
        left: 0,
        right: 0,
          bottom: "var(--atlas-dock-height, 64px)",
        display: "flex",
        flexDirection: "column",
        background: "transparent",
        zIndex: 60,
        overscrollBehavior: "contain",
        touchAction: "none",
      }}
    >
      {subheader}
      {/* Isolated scroll container */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        ref={scrollRef}
        className="atlas-ask-atlas-scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
        }}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          padding: "18px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >


        {messages.map((msg, i) => {
          if (msg.kind === "genesis" && msg.genesisData) {
            return (
              <GenesisCard
                key={i}
                projectName={msg.genesisData.projectName}
                timestamp={msg.genesisData.timestamp}
              />
            );
          }

          if (msg.role === "assistant") {
            const { target: tokenTarget, cleanContent } = extractNavigateTo(msg.content);
            const displayContent = cleanContent;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--app-font-mono)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--atlas-gold)",
                    opacity: 0.55,
                  }}
                >
                  Atlas
                </span>
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: 1.75,
                    color: "var(--atlas-fg)",
                    fontFamily: "var(--app-font-sans)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    opacity: 0.92,
                  }}
                >
                  {(msg.imageUrl || msg.pendingSketch) && (
                    <SketchReveal
                      src={msg.imageUrl ?? null}
                      loading={!!msg.pendingSketch && !msg.imageUrl}
                      alt="Atlas sketch"
                      style={{ marginTop: 0, marginBottom: displayContent ? 10 : 0 }}
                    />
                  )}
                  <AskAtlasRenderer
                    content={displayContent}
                    projects={projects}
                    onNavigate={(id) => void handleProjectOpen(id)}
                    isParchment={isParchment}
                    onCreateProject={msg.role === "assistant" ? onCreateProject : undefined}
                  />

                </div>
                {tokenTarget && (
                  <CommitPill
                    projectId={tokenTarget.projectId}
                    projectTitle={tokenTarget.projectName}
                    onArm={async () => {
                      // Stub feeder-channel attachment (localStorage) so the
                      // header chip + sidebar chip light up immediately.
                      // Backend will replace this with attached_project_id.
                      setFeeder({
                        projectId: tokenTarget.projectId,
                        projectTitle: tokenTarget.projectName,
                      });
                      // Best-effort handoff sync — never blocks navigation.
                      try {
                        await fetch("/api/nexus/handoff", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            messages: messages.slice(-10),
                            projectId: tokenTarget.projectId,
                            conversationId,
                          }),
                        });
                      } catch {}
                    }}
                  />
                )}
                {msg.navigateTo && !dismissedNavIdx.has(i) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setLocation(msg.navigateTo!.route)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--atlas-gold)",
                        borderRadius: 6,
                        padding: "4px 12px",
                        cursor: "pointer",
                        color: "var(--atlas-gold)",
                        fontSize: 12,
                        fontFamily: "var(--app-font-mono)",
                        letterSpacing: "0.08em",
                        fontWeight: 500,
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      Open {msg.navigateTo.projectName ?? "workspace"} →
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedNavIdx(prev => new Set([...prev, i]))}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: "4px 6px",
                        cursor: "pointer",
                        color: "var(--atlas-muted)",
                        fontSize: 12,
                        fontFamily: "var(--app-font-mono)",
                        letterSpacing: "0.06em",
                        opacity: 0.55,
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      stay here
                    </button>
                  </div>
                )}
                {!msg.streaming && displayContent.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => handleCopy(displayContent, i)}
                      aria-label="Copy message"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: "4px 2px",
                        cursor: "pointer",
                        color: copiedIdx === i ? "var(--atlas-gold)" : "var(--atlas-muted)",
                        opacity: copiedIdx === i ? 1 : 0.45,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        fontFamily: "var(--app-font-mono)",
                        letterSpacing: "0.06em",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {copiedIdx === i ? "✓ copied" : (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="5" width="8" height="9" rx="1.5" />
                          <path d="M11 5V4a1.5 1.5 0 00-1.5-1.5h-6A1.5 1.5 0 002 4v7A1.5 1.5 0 003.5 12.5H5" />
                        </svg>
                      )}
                    </button>
                    {!msg.imageUrl && onSketch && (
                      <InlineSketchOffer text={displayContent} onSend={onSketch} />
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--app-font-mono)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "color-mix(in oklab, var(--atlas-gold) 85%, transparent)",
                  opacity: 0.65,
                }}
              >
                You
              </span>
              <div
                style={{
                  padding: "10px 14px",
                  background: "color-mix(in oklab, var(--atlas-gold) 5%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
                  borderRadius: 12,
                  maxWidth: "82%",
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: "var(--atlas-fg)",
                  fontFamily: "var(--app-font-sans)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {renderMessageImages(msg)}
                {msg.content}
              </div>
              {msg.content.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => handleCopy(msg.content, i)}
                    aria-label="Copy message"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "4px 2px",
                      cursor: "pointer",
                      color: copiedIdx === i ? "var(--atlas-gold)" : "var(--atlas-muted)",
                      opacity: copiedIdx === i ? 1 : 0.45,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontFamily: "var(--app-font-mono)",
                      letterSpacing: "0.06em",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {copiedIdx === i ? "✓ copied" : (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="5" width="8" height="9" rx="1.5" />
                        <path d="M11 5V4a1.5 1.5 0 00-1.5-1.5h-6A1.5 1.5 0 002 4v7A1.5 1.5 0 003.5 12.5H5" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}

      </div>
      {showScrollBtn && (
        <button
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") {
              e.preventDefault();
              const el = scrollRef.current;
              if (!el) return;
              el.scrollTop = el.scrollHeight - el.clientHeight;
              requestAnimationFrame(() => {
                if (el) el.scrollTop = el.scrollHeight - el.clientHeight;
              });
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) {
              const el = scrollRef.current;
              if (!el) return;
              el.scrollTop = el.scrollHeight - el.clientHeight;
              requestAnimationFrame(() => {
                if (el) el.scrollTop = el.scrollHeight - el.clientHeight;
              });
            }
          }}
          aria-label="Scroll to latest"
          style={{
            position: "absolute",
            bottom: 10,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--atlas-surface)",
            border: "1px solid var(--atlas-gold)",
            color: "var(--atlas-gold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            zIndex: 50,
            pointerEvents: "auto",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10M4 9l4 4 4-4"/>
          </svg>
        </button>
      )}
      </div>

      {/* Focus backdrop — subtle dim when composer is focused inside Ask Atlas. Tap to dismiss. */}
      {!hideComposer && focused && (
        <div
          onMouseDown={(e) => { e.preventDefault(); textareaRef.current?.blur(); }}
          onTouchStart={() => { textareaRef.current?.blur(); }}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: isParchment ? "rgba(15,23,42,0.10)" : "rgba(0,0,0,0.28)",
            transition: "opacity 200ms ease",
            zIndex: 4,
            pointerEvents: "auto",
          }}
        />
      )}

      {/* Composer — transparent. Label above, textarea in middle, action row below. Hidden when home dock acts as composer. */}
      {!hideComposer && <div
        style={{
          flexShrink: 0,
          padding: "12px 14px calc(14px + env(safe-area-inset-bottom, 0px))",
          background: "transparent",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Portfolio Thinking · Not Building label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: isParchment ? "rgba(15,23,42,0.45)" : "color-mix(in oklab, var(--atlas-gold) 72%, transparent)",
            paddingBottom: 2,
          }}
        >
          <span>Portfolio Thinking · Not Building</span>
        </div>
        <div
          className="atlas-composer-live"
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "transparent",
            border: isParchment
              ? "1px solid rgba(15,23,42,0.10)"
              : "1px solid color-mix(in oklab, var(--atlas-gold) 32%, transparent)",
            borderRadius: 16,
            padding: "10px 12px",

            transition: "border-color 200ms ease, box-shadow 200ms ease",
            minHeight: 72,
            ...getAuraVars("axiom", isParchment),
          } as CSSProperties}
        >
          {/* Attachment preview strip */}
          {attachedFiles.length > 0 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, flexShrink: 0 }}>
              {attachedFiles.map((file, idx) => (
                <div key={idx} style={{ position: "relative", flexShrink: 0 }}>
                  {file.type.startsWith("image/") ? (
                    <img
                      src={filePreviewUrls.current.get(file)}
                      alt={file.name}
                      style={{ width: 54, height: 54, borderRadius: 7, objectFit: "cover", border: "1px solid color-mix(in oklab, var(--atlas-gold) 28%, transparent)", display: "block" }}
                    />
                  ) : (
                    <div style={{ width: 54, height: 54, borderRadius: 7, background: "color-mix(in oklab, var(--atlas-gold) 7%, transparent)", border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, overflow: "hidden" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 7.5l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" stroke="var(--atlas-gold)" strokeOpacity="0.65" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span style={{ fontSize: 8, color: "color-mix(in oklab, var(--atlas-gold) 60%, transparent)", maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}>{file.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span>
                    </div>
                  )}
                  {onRemoveFile && (
                    <button
                      type="button"
                      onClick={() => onRemoveFile(idx)}
                      aria-label="Remove attachment"
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "var(--atlas-surface)", border: "1px solid color-mix(in oklab, var(--atlas-gold) 35%, transparent)", cursor: "pointer", color: "var(--atlas-fg)", fontSize: 10, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 2 }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Textarea row — full width, generous height */}
          <div style={{ position: "relative", flex: 1, minHeight: 56 }}>
            {showPlaceholder && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 4,
                  left: 2,
                  right: 2,
                  pointerEvents: "none",
                  color: "var(--atlas-muted)",
                  opacity: 0.55,
                  fontSize: 16,
                  lineHeight: 1.55,
                  fontFamily: "var(--app-font-sans)",
                  letterSpacing: "-0.005em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {typed}
                <span className="atlas-cursor" />
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={2}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                appearance: "none",
                WebkitAppearance: "none",
                boxShadow: "none",
                color: isParchment ? "#171717" : "var(--atlas-fg)",
                fontSize: 16,
                lineHeight: 1.55,
                letterSpacing: "-0.005em",
                fontFamily: "var(--app-font-sans)",
                padding: "4px 2px",
                minHeight: focused ? 140 : 56,
                maxHeight: focused ? "38vh" : 180,
                transition: "min-height 220ms ease, max-height 220ms ease",
                position: "relative",
                zIndex: 1,
                display: "block",
              }}
            />
          </div>
        </div>

        {/* Action row — sits BELOW the composer as its own row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            position: "relative",
            gap: isTiny ? 4 : 8,
            paddingTop: 4,
          }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: isTiny ? 0 : 6 }}>
              {/* Left cluster: history, then +/⋯ from ComposerActions */}
              <UtilityButton
                ariaLabel="Where were we"
                title="Where were we?"
                onClick={() => void onOpenHistory()}
                tinted
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
              </UtilityButton>
              <ComposerActions
                scope="ask-atlas"
                hasProjectContext={false}
                borderless={true}
                globalContext={true}
                compact={isTiny}
                onFiles={(files) => onFiles?.(files)}
                onMenuAction={(action) => {
                  if (action === "park") { setShowParkSheet(true); return; }
                  if (action === "more:deep-dive") {
                    const recent = messages.slice(-6).map((m) => {
                      const role = m.role === "user" ? "ME" : "ATLAS";
                      return m.content ? `[${role}] ${m.content}` : "";
                    }).filter(Boolean).join("\n\n");
                    const draftLine = input.trim() ? `Current draft:\n${input.trim()}\n\n` : "";
                    const recentLine = recent ? `Recent thread:\n${recent}\n\n` : "";
                    setDeepDiveContext(
                      `I'm thinking through something in Axiom (a strategic thinking partner). Help me deep-dive this — challenge assumptions, surface what I'm missing, and end with a concrete recommendation I can bring back.\n\n${draftLine}${recentLine}`
                    );
                    setShowDeepDive(true);
                    return;
                  }
                  onMenuAction?.(action);
                }}
                onSketch={onSketch}
              />

            </div>

            {/* Focus pill — dead-centered relative to the full action row width */}
            <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
              <div style={{ pointerEvents: "auto" }}>
                {focusChip}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              {/* Add-to-project — only when there's a conversation to capture */}
              {messages.length > 0 && (
                <UtilityButton
                  ariaLabel="Create project from this conversation"
                  title={handoffSignal?.projectName ? `Start workspace: ${handoffSignal.projectName}` : "Create project from this conversation"}
                  onClick={() => onCreateProject?.()}
                  tinted
                  glowing={!!handoffSignal?.projectName}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6.5h5l2 2H20v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                    <path d="M12 12v5" />
                    <path d="M9.5 14.5h5" />
                  </svg>
                </UtilityButton>
              )}
              <UtilityButton
                ariaLabel={isListening ? "Stop voice" : "Voice input"}
                onClick={toggleVoice}
                active={isListening}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10a7 7 0 0014 0" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </UtilityButton>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (canSubmit) handleSubmit();
                }}
                onClick={(e) => {
                  if (e.detail === 0) handleSubmit();
                }}
                disabled={!canSubmit}
                aria-label="Send"
                style={{
                  width: 38,
                  height: 38,
                  flexShrink: 0,
                  borderRadius: 999,
                  border: `1px solid ${canSubmit ? "color-mix(in oklab, var(--atlas-gold) 55%, transparent)" : "color-mix(in oklab, var(--atlas-gold) 15%, transparent)"}`,
                  background: canSubmit
                    ? "linear-gradient(135deg, color-mix(in oklab, var(--atlas-gold) 32%, transparent), color-mix(in oklab, var(--atlas-gold) 16%, transparent))"
                    : "color-mix(in oklab, var(--atlas-fg) 2%, transparent)",
                  color: canSubmit ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  opacity: isSending ? 0.55 : 1,
                  boxShadow: canSubmit ? "0 0 18px -4px color-mix(in oklab, var(--atlas-gold) 45%, transparent)" : "none",
                  transition: "background 200ms ease, border-color 200ms ease, box-shadow 200ms ease",
                }}
              >
                <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 10L17 3 13 17l-3.5-5.5z" />
                  <path d="M17 3 9.5 11.5" />
                </svg>
              </button>
            </div>
          </div>
      </div>}


      <DeepDiveSheet
        open={showDeepDive}
        onClose={() => setShowDeepDive(false)}
        initialContext={deepDiveContext}
        onPasteBack={(text) => {
          setInput(input.trim() ? `${input.trim()}\n\n${text}` : text);
        }}
      />

      {showParkSheet && (
        <ParkSheet
          projectId={null}
          projects={projects}
          onClose={() => setShowParkSheet(false)}
          onOpenFull={() => { setShowParkSheet(false); setLocation("/parking"); }}
        />
      )}
    </div>
  );
}

function UtilityButton({
  children,
  ariaLabel,
  title,
  onClick,
  tinted,
  active,
  glowing,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  title?: string;
  onClick?: () => void;
  tinted?: boolean;
  active?: boolean;
  glowing?: boolean;
}) {
  return (
    <>
      {glowing && (
        <style>{`
          @keyframes ask-atlas-folder-glow {
            0%, 100% { box-shadow: 0 0 6px color-mix(in oklab, var(--atlas-gold) 45%, transparent), 0 0 14px color-mix(in oklab, var(--atlas-gold) 20%, transparent); }
            50% { box-shadow: 0 0 12px color-mix(in oklab, var(--atlas-gold) 75%, transparent), 0 0 24px color-mix(in oklab, var(--atlas-gold) 35%, transparent); }
          }
        `}</style>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 10,
          border: glowing ? "1px solid color-mix(in oklab, var(--atlas-gold) 55%, transparent)" : "1px solid transparent",
          background: glowing
            ? "color-mix(in oklab, var(--atlas-gold) 12%, transparent)"
            : active
              ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)"
              : tinted
                ? "color-mix(in oklab, var(--atlas-gold) 6%, transparent)"
                : "transparent",
          color: glowing || active
            ? "var(--atlas-gold)"
            : tinted
              ? "color-mix(in oklab, var(--atlas-gold) 85%, transparent)"
              : "var(--atlas-muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: onClick ? "pointer" : "default",
          padding: 0,
          WebkitTapHighlightColor: "transparent",
          transition: "background 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
          animation: glowing ? "ask-atlas-folder-glow 2s ease-in-out infinite" : undefined,
        }}
        onMouseEnter={(e) => {
          if (!onClick) return;
          const el = e.currentTarget as HTMLButtonElement;
          el.style.background = glowing ? "color-mix(in oklab, var(--atlas-gold) 18%, transparent)" : "color-mix(in oklab, var(--atlas-gold) 10%, transparent)";
          el.style.color = "var(--atlas-gold)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.background = glowing
            ? "color-mix(in oklab, var(--atlas-gold) 12%, transparent)"
            : active
              ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)"
              : tinted
                ? "color-mix(in oklab, var(--atlas-gold) 6%, transparent)"
                : "transparent";
          el.style.color = glowing || active
            ? "var(--atlas-gold)"
            : tinted
              ? "color-mix(in oklab, var(--atlas-gold) 85%, transparent)"
              : "var(--atlas-muted)";
        }}
      >
        {children}
      </button>
    </>
  );
}

export default AskAtlasSurface;
