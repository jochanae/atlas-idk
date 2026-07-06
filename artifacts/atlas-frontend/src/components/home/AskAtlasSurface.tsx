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
// ComposerDock removed — footer center "A" is the single composer anchor.
import { ensureComposerAuraCSS, getAuraVars } from "@/lib/composerAura";
import InlineSketchOffer from "@/components/chat/InlineSketchOffer";
import { type LiveStep } from "@/components/workspace/StepProgress";
import SketchReveal from "@/components/chat/SketchReveal";
import { ComposerDeepDive } from "@/components/composer/ComposerDeepDive";
import { CollapsibleMessageText } from "@/components/CollapsibleMessageText";
import { ParkSheet } from "@/components/ParkSheet";

import { useSmartAutoScroll } from "@/hooks/useSmartAutoScroll";
import { ThinkingReceiptsStrip } from "./ThinkingReceiptsStrip";
import { followScrollIfNearBottom } from "@/lib/textPacer";
import { CommitPill } from "./CommitPill";
import { setFeeder } from "@/lib/feederStore";
import { useIsTinyMobile } from "@/hooks/use-mobile";
import { triggerNexusHandoff } from "@/lib/askAtlasHelpers";
import { AskAtlasTier1Chip } from "./AskAtlasTier1Chip";
import { AskAtlasUtilityButton } from "./AskAtlasUtilityButton";
import { useAskAtlasTypewriter } from "@/hooks/useAskAtlasTypewriter";
import { setAnchorHeld, triggerAnchorAbsorb, ABSORB_DURATION_MS } from "@/lib/atlasAnchor";
import {
  ASK_ATLAS_PLACEHOLDERS,
  extractNavigateTo,
  findProjectOpenTarget,
  renderMessageImages,
} from "./askAtlasSurfaceUtils";


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
  /** True when Atlas emitted THINKING_STABLE — triggers faster receipt polling + crystallized UI. */
  crystallized?: boolean;
  /** True while the thread restore fetch is in-flight — shows a skeleton instead of blank. */
  isRestoring?: boolean;
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
  crystallized = false,
  isRestoring = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [, setLocation] = useLocation();
  const [focused, setFocused] = useState(false);
  // Progressive collapse: full → compact → docked (post-first-message only).
  // Ambient/entry state (no messages yet) is locked to full ↔ compact.
  const [restingState, setRestingState] = useState<"full" | "compact" | "docked">("full");
  const restingCompact = restingState === "compact";
  const restingDocked = restingState === "docked";
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showParkSheet, setShowParkSheet] = useState(false);
  
  const isParchment = useThemeMode() === "parchment";
  const filePreviewUrls = useRef<Map<File, string>>(new Map());
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [dismissedNavIdx, setDismissedNavIdx] = useState<Set<number>>(new Set());
  const isTiny = useIsTinyMobile();

  // Manage object URLs for image previews
  useEffect(() => { ensureComposerAuraCSS(); }, []);

  // Footer center "A" (atlas:focus-composer) must lift the local docked state
  // so the composer remounts. The shell store's restoreComposer() is separate
  // and doesn't touch this component's local restingState.
  useEffect(() => {
    const onFocus = () => {
      setRestingState("full");
      let tries = 0;
      const tryFocus = () => {
        const el = textareaRef.current;
        if (el) { try { el.focus(); } catch {} return; }
        if (tries++ < 12) setTimeout(tryFocus, 50);
      };
      setTimeout(tryFocus, 60);
    };
    window.addEventListener("atlas:focus-composer", onFocus);
    return () => window.removeEventListener("atlas:focus-composer", onFocus);
  }, []);

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
  const typed = useAskAtlasTypewriter(ASK_ATLAS_PLACEHOLDERS, !showPlaceholder);

  // Publish held state to the footer anchor — halo breathes when a draft
  // exists or a turn is streaming. Only meaningful when this surface is open.
  useEffect(() => {
    if (!open) return;
    setAnchorHeld(Boolean(hasInput || isStreaming));
    return () => setAnchorHeld(false);
  }, [open, hasInput, isStreaming]);

  // Funnel collapse — animates the sheet into the footer anchor + rings the
  // gold ripple, then commits the actual dock state change.
  const [absorbing, setAbsorbing] = useState(false);
  const runAbsorb = (finalize: () => void) => {
    if (absorbing) return;
    setAbsorbing(true);
    triggerAnchorAbsorb();
    window.setTimeout(() => {
      finalize();
      setAbsorbing(false);
    }, ABSORB_DURATION_MS);
  };

  if (!open) return null;

  const canSubmit = (input.trim().length > 0 || hasAttachments) && !isSending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSubmit();
  };

  const handleProjectOpen = async (projectId: number) => {
    const route = `/project/${projectId}`;
    await triggerNexusHandoff({
      conversationId,
      projectId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
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
          padding: restingDocked ? "18px 20px 96px" : "18px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >

        <AskAtlasTier1Chip conversationId={conversationId} />

        {isRestoring && messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>

            {[{ w: "72%", role: "user" }, { w: "88%", role: "assistant" }, { w: "60%", role: "user" }, { w: "94%", role: "assistant" }].map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: item.role === "user" ? "flex-end" : "flex-start",
                  gap: 6,
                }}
              >
                <div style={{
                  height: 8,
                  width: 32,
                  borderRadius: 4,
                  background: "color-mix(in oklab, var(--atlas-gold) 20%, transparent)",
                  animation: `atlas-restore-pulse 1.6s ease-in-out ${i * 0.15}s infinite`,
                }} />
                <div style={{
                  height: item.role === "assistant" ? 64 : 36,
                  width: item.w,
                  maxWidth: item.role === "user" ? "72%" : "100%",
                  borderRadius: 10,
                  background: item.role === "user"
                    ? "color-mix(in oklab, var(--atlas-gold) 6%, transparent)"
                    : "color-mix(in oklab, var(--atlas-fg) 5%, transparent)",
                  border: `0.5px solid ${item.role === "user" ? "color-mix(in oklab, var(--atlas-gold) 18%, transparent)" : "color-mix(in oklab, var(--atlas-fg) 8%, transparent)"}`,
                  animation: `atlas-restore-pulse 1.6s ease-in-out ${i * 0.15}s infinite`,
                }} />
              </div>
            ))}
            <style>{`
              @keyframes atlas-restore-pulse {
                0%, 100% { opacity: 0.35; }
                50% { opacity: 0.7; }
              }
            `}</style>
          </div>
        )}

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
                  className="atlas-prose"
                  style={{
                    fontSize: 16.5,
                    lineHeight: 1.75,
                    letterSpacing: "0.015em",
                    color: "var(--atlas-fg)",
                    fontFamily: "var(--app-font-sans)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    opacity: 0.94,
                    WebkitFontSmoothing: "antialiased",
                    MozOsxFontSmoothing: "grayscale",
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
                  {msg.role === "assistant" && msg.streaming ? (
                    <span className="atlas-live-stream-text" style={{ whiteSpace: "pre-wrap", opacity: 0.92 }}>
                      {displayContent}
                      <span className="atlas-cursor" aria-hidden />
                    </span>
                  ) : (
                    <AskAtlasRenderer
                      content={displayContent}
                      projects={projects}
                      onNavigate={(id) => void handleProjectOpen(id)}
                      isParchment={isParchment}
                      onCreateProject={msg.role === "assistant" ? onCreateProject : undefined}
                    />
                  )}



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
                      await triggerNexusHandoff({
                        conversationId,
                        projectId: tokenTarget.projectId,
                        messages: messages.map((m) => ({ role: m.role, content: m.content })),
                      });
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
                }}
              >
                {renderMessageImages(msg)}
                <CollapsibleMessageText
                  textStyle={{
                    fontSize: 16,
                    lineHeight: 1.7,
                    letterSpacing: "0.015em",
                    color: "var(--atlas-fg)",
                    fontFamily: "var(--app-font-sans)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                </CollapsibleMessageText>
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

        {/* Thinking receipts — appear after streaming settles */}
        <ThinkingReceiptsStrip
          conversationId={conversationId}
          isStreaming={isStreaming}
          turnCount={messages.filter(m => m.role === "assistant" && !m.streaming).length}
          crystallized={crystallized}
        />

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

      {/* Floating dock orb removed — the footer center "A" is the single
          composer anchor across Ask Atlas and Workspace. */}

      {/* Focus backdrop — full-viewport dim when composer is focused. Tap to dismiss. */}
      {!hideComposer && !restingDocked && (
        <div
          aria-hidden={!focused}
          onPointerDown={(e) => { e.preventDefault(); textareaRef.current?.blur(); }}
          style={{
            position: "fixed",
            inset: 0,
            background: isParchment ? "rgba(244,236,216,0.55)" : "rgba(8,8,10,0.55)",
            backdropFilter: isParchment ? "blur(14px) saturate(115%)" : "blur(6px) saturate(120%)",
            WebkitBackdropFilter: isParchment ? "blur(14px) saturate(115%)" : "blur(6px) saturate(120%)",
            opacity: focused ? 1 : 0,
            pointerEvents: focused ? "auto" : "none",
            transition: "opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)",
            zIndex: 55,
          }}
        />
      )}

      {/* Composer — transforms into a fixed bottom sheet when focused (matches workspace ChatComposer). */}
      {!hideComposer && !restingDocked && <div
        style={focused ? {
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          height: "60vh",
          zIndex: 60,
          padding: "18px 16px calc(20px + env(safe-area-inset-bottom, 0px))",
          background: isParchment ? "#FFFFFF" : "var(--atlas-surface, #0b0b0d)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: isParchment
            ? "0 -24px 60px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(15, 23, 42, 0.06)"
            : "0 -24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(201,162,76,0.18)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflow: "hidden",
          transformOrigin: "50% 100%",
          transform: absorbing ? "translateY(24px) scale(0.15, 0.28)" : undefined,
          opacity: absorbing ? 0 : 1,
          transition: absorbing
            ? "transform 260ms cubic-bezier(0.7,0,0.3,1), opacity 220ms ease-in"
            : "height 320ms cubic-bezier(0.22, 1, 0.36, 1), padding 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        } as CSSProperties : {
          flexShrink: 0,
          padding: restingCompact
            ? "2px 12px calc(4px + env(safe-area-inset-bottom, 0px))"
            : "12px 14px calc(14px + env(safe-area-inset-bottom, 0px))",
          background: "transparent",
          display: "flex",
          flexDirection: "column",
          gap: restingCompact ? 4 : 8,
          position: "relative",
          zIndex: 5,
          transformOrigin: "50% 100%",
          transform: absorbing ? "translateY(24px) scale(0.15, 0.35)" : undefined,
          opacity: absorbing ? 0 : 1,
          transition: absorbing
            ? "transform 260ms cubic-bezier(0.7,0,0.3,1), opacity 220ms ease-in"
            : "padding 320ms cubic-bezier(0.22, 1, 0.36, 1), gap 200ms ease",
        }}
      >
        {/* Grip handle — visible in sheet mode; tap to collapse */}
        {focused && (
          <>
            <div
              onPointerDown={(e) => { e.preventDefault(); textareaRef.current?.blur(); }}
              style={{
                alignSelf: "center", width: 44, height: 4, borderRadius: 999,
                background: "rgba(201,162,76,0.35)", marginBottom: 6, cursor: "grab", flexShrink: 0,
              }}
              aria-label="Collapse composer"
            />
            {/* Collapse chevron — mirror of workspace: full → compact resting. */}
            <button
              type="button"
              aria-label="Collapse composer"
              title="Collapse composer"
              onClick={() => {
                textareaRef.current?.blur();
                setRestingState(messages.length > 0 ? "compact" : "full");
              }}
              style={{
                position: "absolute", top: 10, right: 12, zIndex: 6,
                width: 26, height: 26, padding: 0,
                background: "transparent", border: "none",
                color: "var(--atlas-muted)", opacity: 0.65, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 14 14 14 14 20" />
                <polyline points="4 10 10 10 10 4" />
                <line x1="14" y1="14" x2="21" y2="21" />
                <line x1="10" y1="10" x2="3" y2="3" />
              </svg>
            </button>
          </>
        )}
        {/* Dock toggle — one tap collapses to the floating "A". Only after first message. */}
        {!focused && messages.length > 0 && (
          <button
            type="button"
            aria-label={restingDocked ? "Restore composer" : "Dock composer"}
            title={restingDocked ? "Restore composer" : "Minimize to floating A"}
            onClick={() => runAbsorb(() => setRestingState("docked"))}
            style={{
              position: "absolute", top: 4, right: 8, zIndex: 6,
              width: 22, height: 22, padding: 0,
              background: "transparent", border: "none",
              color: "var(--atlas-muted)", opacity: 0.55, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}
        {/* Portfolio Thinking · Not Building label — hidden in compact resting mode */}
        {!restingCompact && (
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
          <span>Portfolio Thinking</span>
        </div>
        )}
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
            minHeight: focused ? 0 : (restingCompact ? 48 : 72),
            flex: focused ? 1 : "none",
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
          <div style={{ position: "relative", flex: 1, minHeight: focused ? 0 : (restingCompact ? 36 : 56) }}>
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
                minHeight: focused ? "100%" : (restingCompact ? 36 : 56),
                maxHeight: focused ? "none" : (restingCompact ? 80 : 180),
                height: focused ? "100%" : undefined,
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
              <AskAtlasUtilityButton
                ariaLabel="Where were we"
                title="Where were we?"
                onClick={() => void onOpenHistory()}
                tinted
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
              </AskAtlasUtilityButton>
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
                <AskAtlasUtilityButton
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
                </AskAtlasUtilityButton>
              )}
              <AskAtlasUtilityButton
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
              </AskAtlasUtilityButton>
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


      <ComposerDeepDive
        open={showDeepDive}
        onClose={() => setShowDeepDive(false)}
        lastAtlasResponse={
          (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m?.role !== "user" && m?.content) return m.content;
            }
            return undefined;
          })()
        }
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


export default AskAtlasSurface;
