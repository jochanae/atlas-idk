import type React from "react";
import { useEffect, useRef, useState } from "react";
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

  // Voice
  voiceSupported: boolean;
  voiceListening: boolean;
  toggleVoice: () => void;

  // Send
  chatPending: boolean;
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
    voiceSupported,
    voiceListening,
    toggleVoice,
    chatPending,
    handleSend,
    createSessionPending,
    sendPreparingSession,
    parkedCount,
    showParkingDrawer,
    setShowParkingDrawer,
    refreshParkedEntries,
  } = props;

  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // When the project is empty, focus the composer so Atlas feels "already in the room".
  // Skip on mobile to avoid yanking the keyboard up uninvited.
  useEffect(() => {
    if (isMobile) return;
    if (messages.length !== 0) return;

    const t = setTimeout(() => { textareaRef.current?.focus(); }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isMobile]);


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

        {/* Hidden input dedicated to server-side code-context zip upload (persistent project context) */}
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

        {/* Hidden input — Camera (mobile rear camera capture) */}
        <input
          id="ws-camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) setAttachedFiles(prev => [...prev, ...files].slice(0, 10));
            e.target.value = "";
          }}
        />

        {/* Hidden input — Photo / Image library */}
        <input
          id="ws-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) setAttachedFiles(prev => [...prev, ...files].slice(0, 10));
            e.target.value = "";
          }}
        />

        {/* Hidden input — File / Document (non-image, non-zip) */}
        <input
          id="ws-doc-input"
          type="file"
          accept=".pdf,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,application/pdf,text/plain,text/markdown,text/csv,application/json"
          multiple
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) setAttachedFiles(prev => [...prev, ...files].slice(0, 10));
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

        {/* First-run banner removed — empty state now lives in the conversation surface
            as a single Atlas-voiced shaping question. No wizard, no setup card. */}


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
                    handleSend();
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


          <div className="atlas-input-actionrow" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, flexWrap: "nowrap", gap: 4 }}>


            {/* Left: unified "+" attach menu. Keep this group open for one future adjacent control. */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
              {(() => {
                const hasAttachment = attachedFiles.length > 0 || zipFiles.length > 0 || !!codeContextStatus;
                return (
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setShowAttachMenu(v => !v)}
                      title="Attach"
                      aria-label="Attach"
                      aria-expanded={showAttachMenu}
                      style={{
                        minWidth: 44, minHeight: 44, padding: 7, borderRadius: 7,
                        background: showAttachMenu
                          ? "rgba(201,162,76,0.12)"
                          : hasAttachment ? "rgba(201,162,76,0.08)" : "transparent",
                        border: (showAttachMenu || hasAttachment)
                          ? "1px solid rgba(201,162,76,0.25)"
                          : "1px solid transparent",
                        color: (showAttachMenu || hasAttachment) ? "var(--atlas-gold)" : "var(--atlas-muted)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: (showAttachMenu || hasAttachment) ? 1 : 0.55,
                        transition: "all var(--motion-fast) var(--ease-standard)",
                        flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>

                    {showAttachMenu && (
                      <>
                        <div
                          onClick={() => setShowAttachMenu(false)}
                          style={{ position: "fixed", inset: 0, zIndex: 59, background: "rgba(0,0,0,0.25)" }}
                        />
                        <div
                          className="atlas-popover"
                          style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 60, minWidth: 260, padding: "6px 0" }}
                          role="menu"
                          aria-label="Attach"
                        >
                          {/* Section: For this message */}
                          <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(201,162,76,0.55)", padding: "6px 12px 4px" }}>
                            For this message
                          </div>

                          {[
                            { htmlFor: "ws-camera-input", label: "Camera", sub: "Take a photo now",
                              icon: (<><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>) },
                            { htmlFor: "ws-photo-input", label: "Photo / Image", sub: "From your library",
                              icon: (<><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>) },
                            { htmlFor: "ws-doc-input", label: "File / Document", sub: "PDF, text, CSV, JSON…",
                              icon: (<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></>) },
                          ].map(item => (
                            <label
                              key={item.htmlFor}
                              htmlFor={item.htmlFor}
                              onClick={() => setShowAttachMenu(false)}
                              style={{
                                display: "flex", alignItems: "center", gap: 12, width: "100%",
                                padding: "10px 12px", cursor: "pointer",
                                color: "var(--atlas-fg)",
                                transition: "background var(--motion-instant) var(--ease-standard)",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.07)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
                                {item.icon}
                              </svg>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>{item.label}</div>
                                <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", marginTop: 2, fontFamily: "var(--app-font-mono)" }}>
                                  {item.sub}
                                </div>
                              </div>
                            </label>
                          ))}

                          {/* Divider */}
                          <div style={{ height: 1, background: "rgba(201,162,76,0.1)", margin: "6px 0" }} />

                          {/* Section: For the project (persistent) */}
                          <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(201,162,76,0.55)", padding: "6px 12px 4px" }}>
                            For the whole project
                          </div>

                          <label
                            htmlFor="ws-code-context-input"
                            onClick={() => setShowAttachMenu(false)}
                            style={{
                              display: "flex", alignItems: "center", gap: 12, width: "100%",
                              padding: "10px 12px",
                              cursor: codeContextUploading ? "wait" : "pointer",
                              pointerEvents: codeContextUploading ? "none" : "auto",
                              color: "var(--atlas-fg)",
                              transition: "background var(--motion-instant) var(--ease-standard)",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.07)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
                              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                              <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>
                                {codeContextStatus ? "Replace Code ZIP" : "Code ZIP"}
                              </div>
                              <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", marginTop: 2, fontFamily: "var(--app-font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {codeContextUploading
                                  ? "Uploading…"
                                  : codeContextStatus
                                    ? (codeContextStatus.summary || `${codeContextStatus.fileCount} files loaded`)
                                    : "Persists across every message"}
                              </div>
                            </div>
                          </label>

                        </div>
                      </>
                    )}

                  </div>
                );
              })()}
            </div>

            {/* Right: voice input + send */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
              <button
                onClick={toggleVoice}
                disabled={!voiceSupported}
                title={voiceListening ? "Stop listening" : "Voice input"}
                aria-label="Voice input"
                className={voiceListening ? "atlas-voice-active" : ""}
                style={{
                  minWidth: 44, minHeight: 44, padding: 6, borderRadius: 8,
                  background: voiceListening ? "var(--atlas-ember)" : "transparent",
                  border: `1px solid ${voiceListening ? "var(--atlas-ember)" : "transparent"}`,
                  color: voiceListening ? "var(--atlas-fg)" : "var(--atlas-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: voiceSupported ? 1 : 0.35,
                  transition: "all var(--motion-base) var(--ease-standard)", flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M2 8a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <line x1="8" y1="14" x2="8" y2="16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>

              <button
                className="atlas-send-btn"
                onClick={() => handleSend()}
                disabled={!hasInput || createSessionPending || chatPending}
                aria-label={sendPreparingSession ? "Preparing session" : "Send message"}
                style={{
                  minWidth: 44, minHeight: 44, padding: 3,
                  background: hasInput && !sendPreparingSession ? "var(--atlas-ember)" : "transparent",
                  border: hasInput ? "none" : "1px solid transparent",
                  boxShadow: hasInput ? "0 0 16px -3px rgba(146,64,14,0.5)" : "none",
                  opacity: chatPending ? 0.55 : 1,
                }}
              >
                {sendPreparingSession || chatPending ? (
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
