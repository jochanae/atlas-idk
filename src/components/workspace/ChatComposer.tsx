import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ZipPanel } from "../ZipImport";
import type { ZipEntry } from "../ZipImport";
import { GenerateBlueprintPill } from "../BlueprintsTab";
import type { WorkspaceLens } from "@/hooks/useChatLens";
import type { ChatMessage } from "@/pages/workspace";

const LENS_PLACEHOLDERS: Record<WorkspaceLens, string[]> = {
  flow: [
    "What are you turning over…",
    "What's the constraint you haven't named…",
    "What would have to be true for this to work…",
    "Where did the last session leave things…",
  ],
  build: [
    "What needs to be built or fixed…",
    "What's the smallest next step…",
    "Where does this slot into the system…",
  ],
  look: [
    "What visual change do you need…",
    "What feels off in the UI…",
    "Describe the vibe you're chasing…",
  ],
  scenario: [
    "What if…",
    "What changes if this assumption flips…",
    "Walk a scenario forward — what breaks first…",
  ],
};

function useComposerTypewriter(phrases: string[], paused: boolean) {
  const [display, setDisplay] = useState("");
  const state = useRef({ phraseIdx: 0, charIdx: 0, phase: "typing" as "typing" | "erasing" });
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  useEffect(() => {
    if (paused || phrases.length === 0) { setDisplay(""); return; }
    state.current = { phraseIdx: 0, charIdx: 0, phase: "typing" };
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const s = state.current;
      const phrase = phrasesRef.current[s.phraseIdx] ?? "";
      if (s.phase === "typing") {
        if (s.charIdx < phrase.length) {
          s.charIdx++;
          setDisplay(phrase.slice(0, s.charIdx));
          timer = setTimeout(tick, 38);
        } else {
          timer = setTimeout(() => { s.phase = "erasing"; tick(); }, 2200);
        }
      } else {
        if (s.charIdx > 0) {
          s.charIdx--;
          setDisplay(phrase.slice(0, s.charIdx));
          timer = setTimeout(tick, 22);
        } else {
          s.phraseIdx = (s.phraseIdx + 1) % phrasesRef.current.length;
          s.phase = "typing";
          timer = setTimeout(tick, 220);
        }
      }
    }
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, phrases.join("|")]);

  return display;
}

function RotatingPlaceholder({ wsLens, hasInput, inputFocused, hasMessages }: { wsLens: WorkspaceLens; hasInput: boolean; inputFocused: boolean; hasMessages: boolean }) {
  const pool = LENS_PLACEHOLDERS[wsLens] ?? LENS_PLACEHOLDERS.flow;
  const paused = hasInput || inputFocused || hasMessages;
  const typed = useComposerTypewriter(pool, paused);
  if (paused) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", top: 0, left: 2,
        color: "var(--atlas-muted)", fontSize: 14, lineHeight: 1.6,
        opacity: 0.6, pointerEvents: "none",
        fontFamily: "var(--app-font-sans)",
      }}
    >
      {typed || pool[0]}
    </div>
  );
}



type AtlasSrcFile = { label: string; path: string; hint: string };

export interface ChatComposerProps {
  // Visibility gate
  leftTab: "chat" | "diff" | "blueprints" | "terminal" | string;

  // File / image / ZIP
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  processZip: (file: File) => Promise<void>;
  attachedFiles: File[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  zipFiles: ZipEntry[];
  zipName: string;
  zipTruncated: boolean;
  toggleZipFile: (path: string) => void;
  setAllZip: (selected: boolean) => void;
  clearZip: () => void;

  // Server-side code-context upload
  uploadCodeContextZip: (file: File) => Promise<void>;
  codeContextStatus: { summary: string; fileCount: number } | null;
  codeContextUploading: boolean;
  clearCodeContext: () => void;

  // First-run overlay
  firstRunDismissed: boolean;
  setFirstRunDismissed: (v: boolean) => void;
  sessionsLoading: boolean;
  projectLoading: boolean;
  sessions: ReadonlyArray<unknown> | undefined;
  messages: ChatMessage[];
  entries: ReadonlyArray<unknown> | undefined;
  linkedRepo: unknown | null | undefined;
  firstRunInput: string;
  setFirstRunInput: (v: string) => void;
  sessionId: number | null;
  doSend: (
    text: string,
    sid: number,
    currentMessages: ChatMessage[],
    ctx?: string | null,
    imageData?: { base64: string; mediaType: string },
  ) => void;

  // Blueprint pill
  projectId: number;
  isMobile: boolean;
  setMobileTab: (t: any) => void;
  setDesktopForceTab: (t: any) => void;

  // Textarea
  hasInput: boolean;
  inputFocused: boolean;
  setInputFocused: (v: boolean) => void;
  wsLens: WorkspaceLens;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  autoResize: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;

  // Tiny screen vault
  isTinyScreen: boolean;
  setShowVault: (v: boolean) => void;

  // Source picker
  showSrcPicker: boolean;
  setShowSrcPicker: React.Dispatch<React.SetStateAction<boolean>>;
  srcReadLoading: boolean;
  ATLAS_SRC_FILES: AtlasSrcFile[];
  handleReadSrc: (filePath: string) => void | Promise<void>;

  // Deep Dive
  showDeepDiveMenu: boolean;
  setShowDeepDiveMenu: React.Dispatch<React.SetStateAction<boolean>>;
  deepDiveCopied: boolean;
  setDeepDiveCopied: (v: boolean) => void;

  // Model
  setShowWsModelSheet: (v: boolean) => void;
  wsModel: string;
  showModelPicker?: boolean;


  // Voice
  voiceSupported: boolean;
  voiceListening: boolean;
  toggleVoice: () => void;

  // Send / stop
  chatPending: boolean;
  handleStop: () => void;
  handleSend: (opts?: { planMode?: boolean }) => void;
  createSessionPending: boolean;

  sendPreparingSession: boolean;

  // Parking trigger
  parkedCount: number;
  showParkingDrawer: boolean;
  setShowParkingDrawer: (v: boolean) => void;
  refreshParkedEntries: () => Promise<unknown> | unknown;
}

export function ChatComposer(props: ChatComposerProps) {
  const {
    leftTab,
    fileInputRef,
    processZip,
    attachedFiles,
    setAttachedFiles,
    zipFiles,
    zipName,
    zipTruncated,
    toggleZipFile,
    setAllZip,
    clearZip,
    uploadCodeContextZip,
    codeContextStatus,
    codeContextUploading,
    clearCodeContext,
    firstRunDismissed,
    setFirstRunDismissed,
    sessionsLoading,
    projectLoading,
    sessions,
    messages,
    entries,
    linkedRepo,
    firstRunInput,
    setFirstRunInput,
    sessionId,
    doSend,
    projectId,
    isMobile,
    setMobileTab,
    setDesktopForceTab,
    hasInput,
    inputFocused,
    setInputFocused,
    wsLens,
    textareaRef,
    input,
    setInput,
    autoResize,
    handleKeyDown,
    isTinyScreen,
    setShowVault,
    showSrcPicker,
    setShowSrcPicker,
    srcReadLoading,
    ATLAS_SRC_FILES,
    handleReadSrc,
    showDeepDiveMenu,
    setShowDeepDiveMenu,
    deepDiveCopied,
    setDeepDiveCopied,
  setShowWsModelSheet,
  wsModel,
  showModelPicker = false,
  voiceSupported,

    voiceListening,
    toggleVoice,
    chatPending,
    handleStop,
    handleSend,
    createSessionPending,
    sendPreparingSession,
    parkedCount,
    showParkingDrawer,
    setShowParkingDrawer,
    refreshParkedEntries,
  } = props;

  const [planMode, setPlanMode] = useState(false);

  return (

    <>
      {/* Input — hidden when Terminal tab is active (terminal has its own input row) */}
      {leftTab !== "terminal" && leftTab !== "blueprints" && leftTab !== "artifacts" && <div className="atlas-composer-glass" style={{ padding: "12px 14px 14px", flexShrink: 0, position: "sticky", bottom: 0, zIndex: 30 }}>
        {/* Hidden file input — handles both images and ZIP files */}
        <input
          ref={fileInputRef}
          id="ws-file-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,.zip,application/zip"
          style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none", overflow: "hidden" }}
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            const zipFile = files.find(f => f.name.endsWith(".zip") || f.type === "application/zip");
            const imgFiles = files.filter(f => !f.name.endsWith(".zip") && f.type !== "application/zip");
            if (zipFile) await processZip(zipFile);
            if (imgFiles.length > 0) setAttachedFiles(prev => [...prev, ...imgFiles].slice(0, 10));
            e.target.value = "";
          }}
        />

        {/* Hidden input dedicated to server-side code-context zip upload */}
        <input
          id="ws-code-context-input"
          type="file"
          accept=".zip,application/zip"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await uploadCodeContextZip(f);
            e.target.value = "";
          }}
        />

        {/* Server code-context status badge */}
        {codeContextStatus && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
            padding: "6px 10px", borderRadius: 8,
            background: "rgba(201,162,76,0.06)", border: "1px solid rgba(201,162,76,0.22)",
            fontSize: 11, fontFamily: "var(--app-font-mono)", color: "rgba(201,162,76,0.85)",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {codeContextStatus.summary || `${codeContextStatus.fileCount} files loaded from zip`}
            </span>
            <button
              onClick={clearCodeContext}
              aria-label="Clear code context"
              title="Clear code context"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", color: "rgba(201,162,76,0.7)", display: "flex", alignItems: "center" }}
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ZIP panel — shows when a ZIP is loaded */}
        {zipFiles.length > 0 && (
          <ZipPanel
            zipName={zipName}
            entries={zipFiles}
            truncated={zipTruncated}
            onToggle={toggleZipFile}
            onSelectAll={() => setAllZip(true)}
            onDeselectAll={() => setAllZip(false)}
            onClear={clearZip}
          />
        )}

        {/* ── First-run onboarding overlay ── */}
        {!firstRunDismissed && !sessionsLoading && !projectLoading && sessions !== undefined && messages.length === 0 && (sessions.length === 0) && (entries?.length ?? 0) === 0 && !linkedRepo && (
          <div style={{
            marginBottom: 12, borderRadius: 12, background: "rgba(201,162,76,0.05)",
            border: "1px solid rgba(201,162,76,0.18)", padding: "16px 16px 14px",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--atlas-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                  <circle cx="8" cy="8" r="7" /><path d="M8 5v4M8 11.5v.5" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--atlas-gold)", letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.9 }}>New workspace</span>
              </div>
              <button onClick={() => setFirstRunDismissed(true)} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--atlas-muted)", padding: "2px 4px", lineHeight: 1, fontSize: 16, opacity: 0.5 }}>×</button>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--atlas-fg)", lineHeight: 1.6, opacity: 0.8 }}>
              What are you building?
            </p>
            <textarea
              value={firstRunInput}
              onChange={e => setFirstRunInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (firstRunInput.trim() && sessionId) {
                    const initCtx = `[WORKSPACE INIT] The user just described what they are building. Use this to immediately initialize project memory with PROJECT_MEMORY: tags (MEMORY_T1 for the core idea, MEMORY_T4 for stack/context if mentioned). Then greet them, confirm you've captured it, and suggest linking their GitHub repo in the Files tab to unlock code-aware features.`;
                    doSend(firstRunInput.trim(), sessionId, messages, initCtx);
                    setFirstRunDismissed(true);
                    setFirstRunInput("");
                  }
                }
              }}
              placeholder="e.g. A SaaS to let agencies manage client portals…"
              rows={2}
              style={{
                width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(201,162,76,0.18)",
                borderRadius: 8, color: "var(--atlas-fg)", fontSize: 13, fontFamily: "var(--app-font-sans)",
                lineHeight: 1.6, padding: "8px 11px", resize: "none", boxSizing: "border-box",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--atlas-muted)", opacity: 0.6 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
                </svg>
                Link a repo in <strong style={{ color: "var(--atlas-gold)", fontWeight: 500, opacity: 0.8 }}>Files</strong> to unlock code features
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setFirstRunDismissed(true)} style={{ background: "none", border: "1px solid var(--atlas-border)", borderRadius: 7, color: "var(--atlas-muted)", fontSize: 12, padding: "5px 12px", cursor: "pointer" }}>Skip</button>
                <button
                  onClick={() => {
                    if (firstRunInput.trim() && sessionId) {
                      const initCtx = `[WORKSPACE INIT] The user just described what they are building. Use this to immediately initialize project memory with PROJECT_MEMORY: tags (MEMORY_T1 for the core idea, MEMORY_T4 for stack/context if mentioned). Then greet them, confirm you've captured it, and suggest linking their GitHub repo in the Files tab to unlock code-aware features.`;
                      doSend(firstRunInput.trim(), sessionId, messages, initCtx);
                      setFirstRunDismissed(true);
                      setFirstRunInput("");
                    }
                  }}
                  disabled={!firstRunInput.trim() || !sessionId}
                  style={{ background: "var(--atlas-ember)", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 600, padding: "5px 14px", cursor: (firstRunInput.trim() && sessionId) ? "pointer" : "not-allowed", opacity: (firstRunInput.trim() && sessionId) ? 1 : 0.4 }}
                >
                  Start →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Generate Blueprint pill — only surfaces when Atlas explicitly offers it */}
        {(() => {
          const assistantMsgs = messages.filter(m => m.role === "assistant");
          const last = assistantMsgs[assistantMsgs.length - 1]?.content ?? "";
          const phraseHit = /Want me to generate a blueprint|Blueprint ready|Shall I generate a blueprint/i.test(last);
          if (!phraseHit) return null;
          return (
            <GenerateBlueprintPill
              projectId={projectId}
              onCreated={() => { if (isMobile) setMobileTab("blueprints"); else setDesktopForceTab("blueprints"); }}
            />
          );
        })()}

        {/* Attachment preview strip */}
        {attachedFiles.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", paddingBottom: 2, flexShrink: 0 }}>
            {attachedFiles.map((file, idx) => (
              <div key={idx} style={{ position: "relative", flexShrink: 0 }}>
                {file.type.startsWith("image/") ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    style={{ width: 54, height: 54, borderRadius: 7, objectFit: "cover", border: "1px solid rgba(201,162,76,0.25)", display: "block" }}
                  />
                ) : (
                  <div style={{ width: 54, height: 54, borderRadius: 7, background: "rgba(201,162,76,0.07)", border: "1px solid rgba(201,162,76,0.2)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, overflow: "hidden" }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 7.5l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" stroke="rgba(201,162,76,0.6)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span style={{ fontSize: 8, color: "rgba(201,162,76,0.55)", maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}>{file.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span>
                  </div>
                )}
                <button
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                  aria-label="Remove attachment"
                  style={{ position: "absolute", top: -5, right: -5, minWidth: 44, minHeight: 44, borderRadius: "50%", background: "var(--atlas-bg)", border: "1px solid rgba(201,162,76,0.3)", cursor: "pointer", color: "var(--atlas-fg)", fontSize: 10, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 14, zIndex: 1 }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div
          className="atlas-input-shell"
          style={{
            padding: "4px 4px",
            transition: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <RotatingPlaceholder wsLens={wsLens} hasInput={hasInput} inputFocused={inputFocused} hasMessages={messages.length > 0} />

              <textarea
                ref={textareaRef}
                aria-label="Message Atlas"
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(); }}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend({ planMode });
                  } else {
                    handleKeyDown(e);
                  }
                }}
                rows={1}
                style={{
                  width: "100%", background: "transparent", border: "none", outline: "none",
                  color: "var(--atlas-fg)", fontSize: 14, lineHeight: 1.6,
                  resize: "none", fontFamily: "var(--app-font-sans)",
                  position: "relative", zIndex: 1,
                  minHeight: 24, maxHeight: 180, overflowY: "hidden", display: "block",
                  padding: "2px 2px",
                }}
              />
            </div>
          </div>


          <div className="atlas-input-actionrow" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, flexWrap: "nowrap", gap: 4 }}>


            {/* Left: paperclip + vault (tiny screens) + wrench (read Atlas source) */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
              <label
                htmlFor="ws-file-input"
                title="Attach image or project ZIP"
                aria-label="Attach file"
                style={{
                  minWidth: 44, minHeight: 44, padding: 7, borderRadius: 7,
                  background: (attachedFiles.length > 0 || zipFiles.length > 0) ? "rgba(201,162,76,0.08)" : "transparent",
                  border: (attachedFiles.length > 0 || zipFiles.length > 0) ? "1px solid rgba(201,162,76,0.2)" : "1px solid transparent",
                  color: (attachedFiles.length > 0 || zipFiles.length > 0) ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: (attachedFiles.length > 0 || zipFiles.length > 0) ? 1 : 0.4, transition: "all var(--motion-fast) var(--ease-standard)",
                  flexShrink: 0, userSelect: "none",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M13 7.5l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>

              <label
                htmlFor="ws-code-context-input"
                title="Upload project ZIP for code context"
                aria-label="Upload code context"
                style={{
                  minWidth: 44, minHeight: 44, padding: 7, borderRadius: 7,
                  background: codeContextStatus ? "rgba(201,162,76,0.08)" : "transparent",
                  border: codeContextStatus ? "1px solid rgba(201,162,76,0.2)" : "1px solid transparent",
                  color: codeContextStatus ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: codeContextUploading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: codeContextUploading ? 0.5 : (codeContextStatus ? 1 : 0.4),
                  transition: "all var(--motion-fast) var(--ease-standard)",
                  flexShrink: 0, userSelect: "none",
                  pointerEvents: codeContextUploading ? "none" : "auto",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                  <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </label>

              {/* Vault — shown in input bar only on tiny screens */}
              {isTinyScreen && (
                <button
                  title="Visual Vault"
                  aria-label="Open visual vault"
                  onClick={() => setShowVault(true)}
                  style={{
                    minWidth: 44, minHeight: 44, padding: 7, borderRadius: 7,
                    background: "transparent", border: "1px solid transparent",
                    color: "var(--atlas-muted)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: 0.4, transition: "all var(--motion-fast) var(--ease-standard)", flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--atlas-gold)"; e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--atlas-muted)"; e.currentTarget.style.opacity = "0.4"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
              )}

              {/* Wrench — read Atlas source into context */}
              <button
                onClick={() => setShowSrcPicker((v) => !v)}
                title="Read Atlas source file into context"
                aria-label="Read Atlas source file into context"
                style={{
                  minWidth: 44, minHeight: 44, padding: 7, borderRadius: 7,
                  background: showSrcPicker ? "rgba(56,189,248,0.1)" : "transparent",
                  border: showSrcPicker ? "1px solid rgba(56,189,248,0.3)" : "1px solid transparent",
                  color: showSrcPicker ? "rgba(56,189,248,0.9)" : "var(--atlas-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: srcReadLoading ? 0.5 : (showSrcPicker ? 1 : 0.4), transition: "all var(--motion-fast) var(--ease-standard)",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { if (!showSrcPicker) e.currentTarget.style.opacity = "0.4"; }}
              >
                {srcReadLoading ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 6" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M10.5 1.5A3.5 3.5 0 007 5c0 .36.05.71.14 1.04L2.5 10.5A1.5 1.5 0 004.5 12.5l4.46-4.64c.33.09.68.14 1.04.14a3.5 3.5 0 000-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="10.5" cy="4.5" r="1" fill="currentColor" />
                  </svg>
                )}
              </button>

              {/* Deep Dive button */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowDeepDiveMenu(v => !v)}
                  title="Deep Dive — send this conversation to ChatGPT, Perplexity or Gemini"
                  aria-label="Open deep dive menu"
                  style={{
                    minWidth: 44, minHeight: 44, padding: 7, borderRadius: 7,
                    background: showDeepDiveMenu ? "rgba(201,162,76,0.1)" : "transparent",
                    border: showDeepDiveMenu ? "1px solid rgba(201,162,76,0.25)" : "1px solid transparent",
                    color: showDeepDiveMenu ? "var(--atlas-gold)" : "var(--atlas-muted)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: showDeepDiveMenu ? 1 : 0.4, transition: "all var(--motion-fast) var(--ease-standard)", flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => { if (!showDeepDiveMenu) e.currentTarget.style.opacity = "0.4"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="6" r="4" />
                    <path d="M8 10v5M5 13h6" />
                    <path d="M5.5 4.5L3 2M10.5 4.5L13 2" />
                  </svg>
                </button>
                {showDeepDiveMenu && (
                  <>
                  <div onClick={() => setShowDeepDiveMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div
                    className="atlas-popover"
                    style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 60, minWidth: 210 }}
                  >
                    <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(201,162,76,0.5)", padding: "4px 10px 6px", borderBottom: "1px solid rgba(201,162,76,0.08)", marginBottom: 4 }}>
                      Deep Dive
                    </div>
                    {([
                      { id: "chatgpt", label: "ChatGPT", sub: "Context auto-fills" },
                      { id: "perplexity", label: "Perplexity", sub: "Context auto-fills" },
                      { id: "gemini", label: "Gemini", sub: deepDiveCopied ? "Copied — paste when it opens" : "Copies context, paste once" },
                    ] as const).map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          // If the user typed something, send ONLY that — don't leak prior turns.
                          // If the input is empty, fall back to the last 5 messages as context.
                          const current = input.trim();
                          const ctx = current
                            ? current
                            : messages.slice(-5).map(m => `${m.role === "user" ? "Me" : "Atlas"}: ${m.content}`).join("\n\n").slice(0, 2000);
                          const encoded = encodeURIComponent(ctx);
                          setShowDeepDiveMenu(false);
                          if (p.id === "chatgpt") {
                            window.open(`https://chatgpt.com/?q=${encoded}`, "_blank");
                          } else if (p.id === "perplexity") {
                            window.open(`https://www.perplexity.ai/search?q=${encoded}`, "_blank");
                          } else {
                            navigator.clipboard.writeText(ctx).catch(() => {});
                            setDeepDiveCopied(true);
                            setTimeout(() => setDeepDiveCopied(false), 3000);
                            toast("Opening Gemini", {
                              description: "Your context is copied — just paste it when you arrive.",
                              duration: 4000,
                            });
                            setTimeout(() => window.open("https://gemini.google.com", "_blank"), 2500);
                          }
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          background: "transparent", border: "none",
                          padding: "7px 10px", borderRadius: 5, cursor: "pointer",
                          transition: "background var(--motion-instant) var(--ease-standard)",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.07)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ fontSize: 12, color: "var(--atlas-fg)", fontWeight: 500 }}>{p.label}</div>
                        <div style={{ fontSize: 10, color: "var(--atlas-muted)", marginTop: 1, fontFamily: "var(--app-font-mono)" }}>{p.sub}</div>
                      </button>
                    ))}
                  </div>
                  </>
                )}
              </div>

              {/* Source picker dropdown */}
              {showSrcPicker && (
                <>
                <div onClick={() => setShowSrcPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
                <div
                  className="atlas-popover"
                  style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                    borderColor: "rgba(56,189,248,0.2)",
                    zIndex: 50, minWidth: 230,
                  }}
                >
                  <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(56,189,248,0.5)", padding: "4px 10px 6px", borderBottom: "1px solid rgba(56,189,248,0.08)", marginBottom: 4 }}>
                    Read Atlas source into context
                  </div>
                  {ATLAS_SRC_FILES.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => handleReadSrc(f.path)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        background: "transparent", border: "none",
                        padding: "6px 10px", borderRadius: 5,
                        cursor: "pointer",
                        transition: "background var(--motion-instant) var(--ease-standard)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(56,189,248,0.07)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ fontSize: 11.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", fontWeight: 500 }}>{f.label}</div>
                      <div style={{ fontSize: 9.5, color: "rgba(var(--atlas-muted-rgb),0.55)", marginTop: 1 }}>{f.hint}</div>
                    </button>
                  ))}
                  <div style={{ fontSize: 9, padding: "4px 10px 2px", color: "rgba(var(--atlas-muted-rgb),0.35)", borderTop: "1px solid rgba(56,189,248,0.06)", marginTop: 4 }}>
                    File loads into context · next message only
                  </div>
                </div>
                </>
              )}
            </div>

            {!isTinyScreen && (
              <span style={{ flex: 1, textAlign: "center", fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.06em", color: "var(--atlas-muted)", opacity: 0.3 }}>
                {isMobile ? "type / for shortcuts" : "Enter · Shift+Enter for newline"}
              </span>
            )}


            {/* Right: model chip + mic + send */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
              {showModelPicker && (
                <button

                  onClick={() => setShowWsModelSheet(true)}
                  title="Switch model"
                  aria-label="Switch model"
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 8px", borderRadius: 20,
                    background: "var(--atlas-surface)",
                    border: "1px solid var(--atlas-surface)",
                    cursor: "pointer", transition: "all var(--motion-fast) var(--ease-standard)", flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,162,76,0.07)"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.32)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--atlas-surface)"; e.currentTarget.style.borderColor = "var(--atlas-surface)"; }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="rgba(var(--atlas-muted-rgb),0.7)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="6" />
                    <path d="M5.5 8.5L7 10l3-4" />
                  </svg>
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-fg)", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
                    {wsModel === "claude" ? "Claude" : wsModel === "gpt4o" ? "GPT-4o" : wsModel === "gemini" ? "Gemini" : wsModel}
                  </span>
                  <svg width="7" height="7" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
                    <path d="M1.5 3L4 5.5L6.5 3" stroke="var(--atlas-fg)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}

              <button
                onClick={() => setPlanMode(v => !v)}
                title="Plan mode"
                aria-label={planMode ? "Disable plan mode" : "Enable plan mode"}
                style={{
                  minWidth: 44, minHeight: 44, padding: 7, borderRadius: 8,
                  background: planMode ? "rgba(201,162,76,0.1)" : "transparent",
                  border: `1px solid ${planMode ? "rgba(201,162,76,0.35)" : "transparent"}`,
                  color: planMode ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all var(--motion-fast) var(--ease-standard)", flexShrink: 1,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="1" width="12" height="14" rx="1.5"/>
                  <line x1="5" y1="5" x2="11" y2="5"/>
                  <line x1="5" y1="8" x2="11" y2="8"/>
                  <line x1="5" y1="11" x2="8" y2="11"/>
                </svg>
              </button>

              {voiceSupported && (
                <button
                  onClick={toggleVoice}
                  title={voiceListening ? "Stop listening" : "Voice input"}
                  aria-label="Voice input"
                  className={voiceListening ? "atlas-voice-active" : ""}
                  style={{
                    minWidth: 44, minHeight: 44, padding: 6, borderRadius: 8,
                    background: voiceListening ? "var(--atlas-ember)" : "var(--atlas-surface)",
                    border: `1px solid ${voiceListening ? "var(--atlas-ember)" : "var(--atlas-border)"}`,
                    color: voiceListening ? "var(--atlas-fg)" : "var(--atlas-muted)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all var(--motion-base) var(--ease-standard)", flexShrink: 0,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M2 8a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <line x1="8" y1="14" x2="8" y2="16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              )}
              {chatPending ? (
                <button
                  onClick={handleStop}
                  title="Stop generating"
                  aria-label="Stop generating"
                  style={{
                    minWidth: 44, minHeight: 44, padding: 3, borderRadius: 10,
                    background: "var(--atlas-surface)",
                    border: "1px solid rgba(146,64,14,0.55)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, transition: "all var(--motion-fast) var(--ease-standard)",
                  }}
                >
                  <svg viewBox="0 0 20 20" width={12} height={12} fill="var(--atlas-ember)">
                    <rect x="4" y="4" width="12" height="12" rx="2.5" />
                  </svg>
                </button>
              ) : (
                <button
                  className="atlas-send-btn"
                  onClick={() => handleSend({ planMode })}
                  disabled={!hasInput || createSessionPending}

                  aria-label={sendPreparingSession ? "Preparing session" : "Send message"}
                  style={{
                    minWidth: 44, minHeight: 44, padding: 3,
                    background: hasInput && !sendPreparingSession ? "var(--atlas-ember)" : "var(--atlas-surface)",
                    border: hasInput ? "none" : "1px solid var(--atlas-border)",
                    boxShadow: hasInput ? "0 0 16px -3px rgba(146,64,14,0.5)" : "none",
                  }}
                >
                  {sendPreparingSession ? (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                      <circle cx="8" cy="8" r="6" stroke="var(--atlas-muted)" strokeWidth="1.5" strokeDasharray="10 6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" width={13} height={13}
                      fill={hasInput ? "var(--atlas-fg)" : "none"}
                      stroke={hasInput ? "var(--atlas-fg)" : "var(--atlas-muted)"}
                      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 10L17 3 13 17l-3.5-5.5z" />
                      <path d="M17 3 9.5 11.5" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>}

      {parkedCount > 0 && !showParkingDrawer && (
        <button
          type="button"
          onClick={() => { setShowParkingDrawer(true); void refreshParkedEntries(); }}
          style={{
            position: "absolute",
            right: 16,
            bottom: 104,
            zIndex: 42,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 10px",
            borderRadius: 999,
            background: "var(--atlas-surface)",
            border: "1px solid var(--atlas-border)",
            color: "var(--atlas-muted)",
            cursor: "pointer",
            fontFamily: "var(--app-font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            boxShadow: "0 12px 28px -20px var(--atlas-gold)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--atlas-gold)", display: "inline-block", flexShrink: 0 }} />
          {parkedCount} items
        </button>
      )}
    </>
  );
}
