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
import { AttachmentStrip } from "@/components/shared/AttachmentStrip";

// Strips the most visually jarring raw-markdown syntax during streaming so the
// user doesn't see **asterisks** and ## hashes for the full response duration.
// Code fences are preserved verbatim. Does NOT attempt full markdown parsing.
function sanitizeForStreaming(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  let inAtlasFence = false;
  for (const line of lines) {
    // Atlas card fences — hide the entire block during streaming so the
    // user never sees raw JSON payload.
    if (!inFence && /^```atlas-/.test(line)) { inAtlasFence = true; continue; }
    if (inAtlasFence) { if (/^```\s*$/.test(line)) inAtlasFence = false; continue; }
    // Regular code fences — preserve verbatim.
    if (/^```/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }
    // Outside all fences — strip the most visually jarring markdown syntax.
    out.push(
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
        .replace(/^\s*\|[-:\s|]+\|\s*$/, ""),
    );
  }
  return out.join("\n");
}

// Repair a common LLM whitespace glitch: a sentence-ending period/!?/em-dash
// followed immediately by a capitalized word with no space. Conservative —
// requires ≥2 lowercase letters before the punctuation and a Capital+lowercase
// after, so URLs, abbreviations (U.S.A), and file extensions are untouched.
function fixMissingSentenceSpaces(text: string): string {
  return text.replace(/([a-z]{2}[.!?])([A-Z][a-z])/g, "$1 $2");
}

function inferLibraryKind(text: string): import("@/lib/library").LibraryItemKind {
  if (/prd|product requirement/i.test(text)) return "prd";
  if (/plan|roadmap/i.test(text)) return "plan";
  if (/strateg/i.test(text)) return "strategy";
  if (/spec/i.test(text)) return "spec";
  if (/brief/i.test(text)) return "brief";
  if (/outline/i.test(text)) return "outline";
  return "document";
}

function inferLibraryTitle(text: string): string {
  const headingMatch = text.match(/^#{1,3}\s+(.+)/m);
  const raw = headingMatch ? headingMatch[1] : text.replace(/[#*_`]/g, "").trim();
  return raw.slice(0, 80) || "Atlas note";
}
import { type NexusHandoffSignal } from "@/hooks/useNexusChatStream";
import { useLocation } from "wouter";

function formatMsgDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    const sameYear = d.getFullYear() === now.getFullYear();
    if (sameYear) return d.toLocaleDateString([], { month: "short", day: "numeric" });
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return "";
  }
}
import { useThemeMode } from "@/lib/theme";
import { GenesisCard } from "./GenesisCard";
import { AskAtlasRenderer } from "./AskAtlasRenderer";
import { SuggestionChipRail } from "@/components/workspace/SuggestionChipRail";
import { ComposerActions, type ComposerMenuAction } from "@/components/composer/ComposerActions";
// ComposerDock removed — footer center "A" is the single composer anchor.
import { ensureComposerAuraCSS, getAuraVars } from "@/lib/composerAura";
import InlineSketchOffer from "@/components/chat/InlineSketchOffer";
import { SpeakButton } from "@/components/workspace/SpeakButton";
import { type LiveStep, StepProgress } from "@/components/workspace/StepProgress";
import { ArtifactCreatedCard } from "@/components/workspace/ArtifactCreatedCard";
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
import { triggerNexusHandoff, navigateAfterAskAtlasHandoff } from "@/lib/askAtlasHelpers";
import { useActiveProjectContext } from "@/lib/activeProjectContext";
import { AskAtlasTier1Chip } from "./AskAtlasTier1Chip";
import { AskAtlasUtilityButton } from "./AskAtlasUtilityButton";
import { useAskAtlasTypewriter } from "@/hooks/useAskAtlasTypewriter";
import { createLibraryItem } from "@/lib/library";
import { setAnchorHeld, triggerAnchorAbsorb, ABSORB_DURATION_MS } from "@/lib/atlasAnchor";
import {
  ASK_ATLAS_PLACEHOLDERS,
  askAtlasMessageHasSketch,
  extractNavigateTo,
  findProjectOpenTarget,
  renderMessageImages,
  resolveAskAtlasSketchSrc,
} from "./askAtlasSurfaceUtils";
import { formatSketchUserPromptDisplay, SKETCH_PROMPT_MARKER_RE } from "@/lib/sketchStylePresets";


export type AskAtlasMessage = {
  role: "user" | "assistant";
  content: string;
  /** Client or server message id — used to skip ephemeral resume greetings for chips. */
  id?: string | number;
  kind?: "genesis";
  genesisData?: { projectName: string; timestamp: string };
  streaming?: boolean;
  createdAt?: string;
  imageUrl?: string;
  /** Base64 payload from async `event: image` (preferred over imageUrl). */
  imageB64?: string;
  imageMimeType?: string;
  pendingSketch?: boolean;
  sketchFailed?: boolean;
  /** Async image-gen payload from nexus stream / persisted thread reload. */
  imageGen?: {
    images: Array<{
      imageUrl: string;
      prompt?: string;
      model?: string;
      mode?: "render" | "schematic" | string;
    }>;
  } | null;
  attachments?: Array<{ base64: string; mediaType: string; name?: string }>;
  navigateTo?: { route: string; projectId?: number; projectName?: string | null } | null;
  projectChoices?: Array<{ id: number; name: string }> | null;
  projectNotFound?: string | null;
  generatedArtifacts?: Array<{
    artifactId: number | string;
    projectId?: number;
    type: string;
    title: string;
    extension?: string;
    downloadUrl: string;
    summary?: string | null;
  }> | null;
  /** Suggestion pills from NEXT_SUGGESTIONS — one-tap continuations. */
  nextSuggestions?: string[] | null;
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
  /** When an interactive card (atlas-choice, atlas-clarify) is tapped, this
   *  sends the chosen option text as a user message into the conversation. */
  onSend?: (text: string) => void;
  /** When a quick-action pill (atlas-action) is tapped, fires the registered
   *  app-level handler for that action ID. */
  onAction?: (id: string, payload?: Record<string, string | number>) => void;
  /** When provided, clicking the crystallize button opens the destination picker
   *  sheet instead of immediately creating a new project. */
  onCrystallize?: () => void;
  onAddAsset?: () => void;
  onMore?: () => void;
  onFiles?: (files: File[]) => void;
  onMenuAction?: (action: ComposerMenuAction) => void;
  onSketch?: (prompt: string) => void;
  stagedFiles?: import("@/hooks/useStagedAttachments").StagedFile[];
  onRemoveFile?: (id: string) => void;
  onRetryFile?: (id: string) => void;
  focusChip?: ReactNode;
  /** Focus lens chip rendered top-left INSIDE the composer rectangle (all modes). */
  focusLensChip?: ReactNode;
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
  onSend,
  onAction,
  onCrystallize,
  onAddAsset,
  onMore,
  onFiles,
  onMenuAction,
  onSketch,
  stagedFiles = [],
  onRemoveFile,
  onRetryFile,
  focusChip,
  focusLensChip,
  subheader,
  hideComposer = false,
  handoffSignal,
  crystallized = false,
  isRestoring = false,
}: Props) {
  // Internal verbs describe model machinery, not user-relevant actions.
  // Only surface steps that answer "what is Atlas doing for me right now?"
  const SUPPRESS_STEP_VERBS = new Set(["Reading", "Saved", "Recovered", "Failed", "Cancelled"]);
  const visibleLiveStep = liveStep && !SUPPRESS_STEP_VERBS.has(liveStep.verb) ? liveStep : undefined;

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
  const [savedIdxSet, setSavedIdxSet] = useState<Set<number>>(new Set());
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showParkSheet, setShowParkSheet] = useState(false);
  
  const isParchment = useThemeMode() === "parchment";
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

  // Smart Anchor auto-scroll — stick to bottom only if user is already near bottom.
  // If they scrolled up to re-read, freeze; don't yank them back during streaming.
  // Force-jump ONLY when the user sends a new message (not on each assistant turn),
  // so incoming Atlas replies never rip the reader away from mid-conversation.
  const userMessageCount = messages.filter(m => m.role === "user").length;
  useSmartAutoScroll(scrollRef, [messages.length, isStreaming], {
    enabled: open,
    threshold: 160,
    forceDeps: [userMessageCount],
  });

  // Follow scroll during streaming — fires on every token so the view tracks
  // the growing bubble instead of jumping when streaming ends. Only follows
  // when the reader is still near the bottom (respects manual scroll-up).
  useEffect(() => {
    if (!isStreaming) return;
    followScrollIfNearBottom(scrollRef.current, 200);
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
    // Collapse composer to compact resting state + release focus so the
    // sheet shrinks and the conversation reclaims the screen.
    setFocused(false);
    setRestingState("compact");
    try { textareaRef.current?.blur(); } catch {}
  };

  const handleProjectOpen = async (projectId: number) => {
    await triggerNexusHandoff({
      conversationId,
      projectId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    // INT-13: never land quiet — seed continuation and pin conversation id when known.
    navigateAfterAskAtlasHandoff(projectId, setLocation, {
      source: "home-handoff",
      conversationId: conversationId ?? null,
    });
  };

  const handleCopy = (content: string, idx: number) => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    });
  };

  const handleSaveToLibrary = async (content: string, idx: number) => {
    if (savedIdxSet.has(idx)) return;
    await createLibraryItem({
      title: inferLibraryTitle(content),
      content,
      kind: inferLibraryKind(content),
      origin: {
        source: "ask-atlas",
        conversationId: conversationId ?? undefined,
      },
    });
    setSavedIdxSet((prev) => new Set([...prev, idx]));
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
        background: "var(--atlas-bg, #0a0a0f)",
        zIndex: 260,
        overscrollBehavior: "contain",
        touchAction: "pan-y",
      }}
    >
      {subheader}
      <WorkspaceContextChip />
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
          alignItems: "center",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 760,
            display: "flex",
            flexDirection: "column",
            gap: 26,
          }}
        >

        <AskAtlasTier1Chip conversationId={conversationId} paused={messages.length === 0} />

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
             const displayContent = fixMissingSentenceSpaces(cleanContent);
             const sketchSrc = resolveAskAtlasSketchSrc(msg);
             const showSketch = askAtlasMessageHasSketch(msg);
             return (
              <div key={i} data-msg-idx={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontFamily: "var(--app-font-mono)",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--atlas-gold)",
                      opacity: 0.42,
                    }}
                  >
                    Atlas
                  </span>
                  {msg.createdAt && (
                    <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.32, letterSpacing: "0.04em" }}>
                      {formatMsgDate(msg.createdAt)}
                    </span>
                  )}
                </span>
                <div
                  className="atlas-prose atlas-prose-flow"
                  style={{
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {showSketch && (
                    <SketchReveal
                      src={sketchSrc}
                      loading={!!msg.pendingSketch && !sketchSrc}
                      alt="Atlas sketch"
                      style={{ marginTop: 0, marginBottom: displayContent ? 10 : 0 }}
                    />
                  )}
                  {msg.sketchFailed && !sketchSrc && !msg.pendingSketch && onSketch && (
                    <div style={{ marginBottom: displayContent ? 10 : 0, display: "flex", alignItems: "center", gap: 8, opacity: 0.55 }}>
                      <span style={{ fontSize: 12, letterSpacing: "0.02em", color: "var(--atlas-muted)" }}>
                        Sketch unavailable
                      </span>
                      <button
                        type="button"
                        onClick={() => onSketch("Sketch this again")}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--atlas-gold)",
                          fontSize: 12,
                          padding: "2px 6px",
                          borderRadius: 4,
                          opacity: 0.85,
                          fontFamily: "var(--app-font-mono)",
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {msg.role === "assistant" && msg.streaming ? (
                    <>
                      <span className="atlas-live-stream-text" style={{ whiteSpace: "pre-wrap" }}>
                        {sanitizeForStreaming(displayContent)}
                        <span className="atlas-cursor" aria-hidden />
                      </span>
                      {visibleLiveStep && displayContent.trim().length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, opacity: 0.5 }}>
                          <span style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: "var(--atlas-gold)",
                            animation: "atlas-pulse 1.4s ease-in-out infinite",
                            flexShrink: 0,
                          }} />
                          <span style={{
                            fontFamily: "var(--app-font-mono)",
                            fontSize: 10,
                            letterSpacing: "0.08em",
                            color: "var(--atlas-muted)",
                          }}>
                            {visibleLiveStep.verb}{visibleLiveStep.target ? ` ${visibleLiveStep.target}` : ""}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <AskAtlasRenderer
                      content={displayContent}
                      projects={projects}
                      onNavigate={(id) => void handleProjectOpen(id)}
                      isParchment={isParchment}
                      onCreateProject={msg.role === "assistant" ? onCreateProject : undefined}
                      onSend={onSend}
                      onAction={onAction}
                    />
                  )}

                  {msg.role === "assistant" && !msg.streaming &&
                    msg.generatedArtifacts && msg.generatedArtifacts.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {msg.generatedArtifacts.map((artifact) => (
                        <ArtifactCreatedCard
                          key={artifact.artifactId}
                          artifact={artifact}
                          projectId={artifact.projectId ?? 0}
                        />
                      ))}
                    </div>
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
                      // Best-effort handoff sync — CommitPill navigates after onArm
                      // with INT-13 continuation seeded.
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
                      onClick={() => {
                        const pid = msg.navigateTo!.projectId;
                        if (pid) {
                          navigateAfterAskAtlasHandoff(pid, setLocation, {
                            source: "home-handoff",
                            conversationId: conversationId ?? null,
                          });
                        } else {
                          setLocation(msg.navigateTo!.route);
                        }
                      }}
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
                {!msg.streaming && msg.projectChoices && msg.projectChoices.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      fontSize: 11,
                      fontFamily: "var(--app-font-mono)",
                      color: "var(--atlas-muted)",
                      letterSpacing: "0.08em",
                      marginBottom: 6,
                      opacity: 0.7,
                    }}>
                      WHICH PROJECT?
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {msg.projectChoices.map(choice => (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() =>
                            navigateAfterAskAtlasHandoff(choice.id, setLocation, {
                              source: "home-handoff",
                              conversationId: conversationId ?? null,
                            })
                          }
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
                          {choice.name} →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!msg.streaming && msg.projectNotFound && (
                  <div style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontFamily: "var(--app-font-mono)",
                    color: "var(--atlas-muted)",
                    letterSpacing: "0.06em",
                    opacity: 0.75,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}>
                    <span style={{ opacity: 0.5 }}>⚠</span>
                    No project named &ldquo;{msg.projectNotFound}&rdquo; found in your workspace.
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
                    <SpeakButton text={displayContent} size={13} />
                    {displayContent.length > 350 && (
                      <button
                        type="button"
                        onClick={() => void handleSaveToLibrary(displayContent, i).catch(() => {})}
                        aria-label={savedIdxSet.has(i) ? "Saved to Library" : "Save to Library"}
                        title={savedIdxSet.has(i) ? "Saved to Library" : "Save to Library"}
                        disabled={savedIdxSet.has(i)}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: "4px 2px",
                          cursor: savedIdxSet.has(i) ? "default" : "pointer",
                          color: savedIdxSet.has(i) ? "var(--atlas-gold)" : "var(--atlas-muted)",
                          opacity: savedIdxSet.has(i) ? 0.9 : 0.45,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontFamily: "var(--app-font-mono)",
                          letterSpacing: "0.06em",
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        {savedIdxSet.has(i) ? "✓ saved" : (
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 2h8a1 1 0 011 1v11l-4-2-4 2V3a1 1 0 011-1z" />
                          </svg>
                        )}
                      </button>
                    )}
                    {!askAtlasMessageHasSketch(msg) && !msg.sketchFailed && onSketch && (
                      <InlineSketchOffer text={displayContent} onSend={onSketch} />
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={i} data-msg-idx={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {msg.createdAt && (
                  <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.32, letterSpacing: "0.04em" }}>
                    {formatMsgDate(msg.createdAt)}
                  </span>
                )}
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
                {msg.attachments && msg.attachments.length > 0 && (
                  <AttachmentStrip
                    mode="sent"
                    attachments={msg.attachments}
                  />
                )}
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
                  {SKETCH_PROMPT_MARKER_RE.test(msg.content)
                    ? formatSketchUserPromptDisplay(msg.content)
                    : msg.content}
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

        {(isSending || isStreaming) && (
          <div style={{ padding: "8px 0 0" }}>
            <StepProgress
              mode="single"
              isStreaming={isSending || isStreaming}
              hasContent={Boolean(
                messages[messages.length - 1]?.role === "assistant" &&
                messages[messages.length - 1]?.content.trim().length > 0
              )}
              liveStep={visibleLiveStep}
              pendingPhrase=""
            />
          </div>
        )}

        {/* Suggestion pills — same NEXT_SUGGESTIONS rail as workspace. Shown when
            the turn is idle; hidden while Thinking / streaming. */}
        {(() => {
          if (isSending || isStreaming) return null;
          let chipMsg: AskAtlasMessage | null = null;
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role !== "assistant" || m.streaming) continue;
            // Skip ephemeral "Welcome back" resume greetings so reload keeps real chips.
            if (String(m.id ?? "").startsWith("aa-resume-")) continue;
            chipMsg = m;
            break;
          }
          if (!chipMsg) return null;
          return (
            <SuggestionChipRail
              lastAssistantText={chipMsg.content ?? ""}
              nextSuggestions={chipMsg.nextSuggestions ?? undefined}
              onTap={(text) => {
                // One-tap continuation — send immediately when possible.
                if (onSend) {
                  onSend(text);
                  return;
                }
                setInput(input.trim() ? `${input.trim()} ${text}` : text);
                setTimeout(() => { try { textareaRef.current?.focus(); } catch { /* noop */ } }, 80);
              }}
              onLongPress={(text) => {
                // Long-press parks into the composer for edit before send.
                setInput(input.trim() ? `${input.trim()} ${text}` : text);
                setTimeout(() => { try { textareaRef.current?.focus(); } catch { /* noop */ } }, 80);
              }}
            />
          );
        })()}

        {/* Thinking receipts removed from the inline conversation flow —
            they belong in a dismissible floating HUD, not interrupting
            the thread. Restore behind a HUD component when ready. */}
        {false && (
          <ThinkingReceiptsStrip
            conversationId={conversationId}
            isStreaming={isStreaming}
            turnCount={messages.filter(m => m.role === "assistant" && !m.streaming).length}
            crystallized={crystallized}
          />
        )}

        </div>
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
            zIndex: 255,
          }}
        />
      )}

      {/* Composer — transforms into a fixed bottom sheet when focused (matches workspace ChatComposer). */}
      {!hideComposer && !restingDocked && <div
        style={focused ? {
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          height: "60vh",
          zIndex: 260,
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
          {/* Focus lens chip — top-left inside the composer rectangle,
              visible in every composer mode (full / compact / conversation). */}
          {focusLensChip && (
            <div style={{ display: "flex", alignItems: "center", minHeight: 0, marginBottom: -2 }}>
              {focusLensChip}
            </div>
          )}
          {/* Dock toggle — inside the bordered composer box so it doesn't float outside */}
          {!focused && messages.length > 0 && (
            <button
              type="button"
              aria-label={restingDocked ? "Restore composer" : "Dock composer"}
              title={restingDocked ? "Restore composer" : "Minimize to floating A"}
              onClick={() => runAbsorb(() => setRestingState("docked"))}
              style={{
                position: "absolute", top: 8, right: 10, zIndex: 6,
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
          {/* Attachment preview strip — B2 shared renderer */}
          {stagedFiles.length > 0 && onRemoveFile && (
            <AttachmentStrip
              mode="staged"
              files={stagedFiles}
              onRemove={onRemoveFile}
              onRetry={onRetryFile}
            />
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
              onChange={(e) => {
                setInput(e.target.value);
              }}
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
                  ariaLabel="Crystallize conversation"
                  title={handoffSignal?.projectName ? `Crystallize: ${handoffSignal.projectName}` : "Crystallize conversation…"}
                  onClick={() => onCrystallize ? onCrystallize() : onCreateProject?.()}
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
                  // Prevent focus from moving off the textarea. If focus moves,
                  // `focused` flips to false, the composer reflows from a fixed
                  // 60vh sheet to inline compact between pointerdown and click,
                  // and the click never lands on Send — the classic "first tap
                  // collapses, second tap sends" regression.
                  e.preventDefault();
                  // Capture the pointer so the release/click always fires on THIS
                  // button, even if the composer height shifts after send and the
                  // finger ends up over a different element (previously this could
                  // fire the header settings/profile button by accident).
                  try { (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId); } catch {}
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canSubmit) handleSubmit();
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
                  touchAction: "manipulation",
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

/**
 * WorkspaceContextChip — visible signal that Ask Atlas is opened in-project.
 * Reads activeProjectContext (populated by Workspace on mount). When present,
 * shows "In: <project name>" with a "Back to workspace" tap.
 *
 * The chip is the *user-facing* half of the "same conversation, two views"
 * seam. The invisible half (sending projectId+sessionId+seed on chat POST)
 * is wired via home.tsx → useNexusChatStream({ askAtlasInProject }). Backend
 * contract: docs/handoffs/2026-07-07-ask-atlas-in-project-mode.md.
 */
function WorkspaceContextChip() {
  const ctx = useActiveProjectContext();
  const [, setLoc] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const restore = () => setDismissed(false);
    window.addEventListener("axiom:restore-workspace-context-chip", restore);
    return () => window.removeEventListener("axiom:restore-workspace-context-chip", restore);
  }, []);
  if (!ctx || dismissed) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        margin: "8px 16px 0",
        borderRadius: 999,
        background: "color-mix(in oklab, var(--atlas-gold, #C9A84C) 12%, transparent)",
        border: "1px solid color-mix(in oklab, var(--atlas-gold, #C9A84C) 35%, transparent)",
        fontFamily: "var(--app-font-mono)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--atlas-gold, #C9A84C)",
        alignSelf: "flex-start",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--atlas-gold, #C9A84C)" }} />
      <span>In: {ctx.projectName}</span>
      <button
        type="button"
        onClick={() => setLoc(`/project/${ctx.projectId}`)}
        style={{
          background: "transparent",
          border: 0,
          color: "var(--atlas-gold, #C9A84C)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 10,
          letterSpacing: "0.08em",
          padding: "0 2px",
          textDecoration: "underline",
        }}
        aria-label="Back to workspace"
      >
        Workspace →
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        style={{
          background: "transparent",
          border: 0,
          color: "color-mix(in oklab, var(--atlas-gold, #C9A84C) 60%, transparent)",
          cursor: "pointer",
          fontSize: 12,
          padding: "0 2px",
          lineHeight: 1,
        }}
        aria-label="Dismiss context chip"
      >
        ×
      </button>
    </div>
  );
}



export default AskAtlasSurface;
