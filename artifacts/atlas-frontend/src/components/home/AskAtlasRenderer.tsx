// ─────────────────────────────────────────────────────────────────────────────
// AskAtlasRenderer.tsx
//
// Ask Atlas surface wrapper around the shared <AtlasMarkdown/> primitive.
// Contributes only surface-specific behavior:
//   • tokenizer for project name links, folder-CTA phrases, file paths
//   • fenced-code interception for atlas-choice / atlas-clarify / atlas-action
//
// All markdown structure (paragraphs, lists, tables, headings, code blocks,
// links) is rendered by the shared component so Ask Atlas and Workspace stay
// visually in parity.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { AtlasMarkdown, type AtlasPreRenderer, type AtlasTokenizer } from "../AtlasMarkdown";
import { parseAtlasCard } from "../AtlasCardParser";
import { AtlasConversationCard } from "../AtlasConversationCards";
import { parseAtlasAction } from "../AtlasActionParser";
import { AtlasActionRow } from "../AtlasActionRow";

type Project = { id: number; name: string };

interface Props {
  content: string;
  projects: Project[];
  onNavigate: (projectId: number) => void;
  isParchment?: boolean;
  onCreateProject?: (nameOverride?: string) => void;
  /** When provided, interactive cards can submit a reply into the conversation. */
  onSend?: (text: string) => void;
  /** When provided, quick-action pills trigger app-level commands. */
  onAction?: (id: string, payload?: Record<string, string | number>) => void;
}

const FILE_PATH_RE =
  /`([^`]*\/[^`]+\.[a-z]{2,4})`|(?<!\w)((?:src|artifacts|packages|apps)\/[\w./-]+\.(?:tsx?|jsx?|css|json|md|ts))/g;

const FOLDER_CTA_RE = /tap the folder icon \(🗂\)[^.!?\n]*/gi;

export function AskAtlasRenderer({
  content,
  projects,
  onNavigate,
  isParchment,
  onCreateProject,
  onSend,
  onAction,
}: Props) {
  if (!content) return null;

  const linkColor = isParchment ? "rgba(146,64,14,0.9)" : "rgba(212,175,55,0.95)";
  const fileLinkColor = isParchment ? "rgba(100,80,14,0.75)" : "rgba(180,160,80,0.8)";

  // Stable-ish sorted list for regex (longest project name first so overlaps
  // resolve to the more specific match).
  const sorted = React.useMemo(
    () => [...projects].sort((a, b) => b.name.length - a.name.length),
    [projects],
  );
  const namePattern = React.useMemo(
    () =>
      sorted
        .map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .filter(Boolean)
        .join("|"),
    [sorted],
  );

  type Seg =
    | { type: "text"; text: string }
    | { type: "project"; text: string; projectId: number }
    | { type: "file"; text: string }
    | { type: "create"; text: string };

  const tokenize: AtlasTokenizer = React.useCallback(
    (text, keyBase) => {
      // Pass 1: folder CTA phrase
      const stage1: Seg[] = [];
      if (onCreateProject) {
        const re = new RegExp(FOLDER_CTA_RE.source, "gi");
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          if (m.index > last) stage1.push({ type: "text", text: text.slice(last, m.index) });
          stage1.push({ type: "create", text: m[0] });
          last = m.index + m[0].length;
        }
        if (last < text.length) stage1.push({ type: "text", text: text.slice(last) });
      } else {
        stage1.push({ type: "text", text });
      }

      // Pass 2: project names
      const stage2: Seg[] = [];
      const combined = namePattern ? new RegExp(`(${namePattern})`, "gi") : null;
      for (const seg of stage1) {
        if (seg.type !== "text") { stage2.push(seg); continue; }
        if (!combined) { stage2.push(seg); continue; }
        const parts = seg.text.split(combined);
        for (const part of parts) {
          const matched = sorted.find((p) => p.name.toLowerCase() === part.toLowerCase());
          if (matched) {
            stage2.push({ type: "project", text: part, projectId: matched.id });
          } else {
            stage2.push({ type: "text", text: part });
          }
        }
      }

      // Pass 3: file paths
      const stage3: Seg[] = [];
      for (const seg of stage2) {
        if (seg.type !== "text") { stage3.push(seg); continue; }
        const re = new RegExp(FILE_PATH_RE.source, "g");
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(seg.text)) !== null) {
          if (m.index > last) stage3.push({ type: "text", text: seg.text.slice(last, m.index) });
          stage3.push({ type: "file", text: m[1] ?? m[2] });
          last = m.index + m[0].length;
        }
        if (last < seg.text.length) stage3.push({ type: "text", text: seg.text.slice(last) });
      }

      if (stage3.every((s) => s.type === "text")) return text;

      return (
        <>
          {stage3.map((seg, i) => {
            const key = `${keyBase}-${i}`;
            if (seg.type === "project") {
              return (
                <span
                  key={key}
                  role="link"
                  tabIndex={0}
                  onClick={() => onNavigate(seg.projectId)}
                  onKeyDown={(e) => { if (e.key === "Enter") onNavigate(seg.projectId); }}
                  style={{
                    color: linkColor,
                    textDecoration: "underline",
                    textDecorationStyle: "dotted",
                    textUnderlineOffset: "3px",
                    cursor: "pointer",
                    fontWeight: 500,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {seg.text}
                </span>
              );
            }
            if (seg.type === "create") {
              return (
                <span
                  key={key}
                  role="link"
                  tabIndex={0}
                  onClick={() => onCreateProject?.()}
                  onKeyDown={(e) => { if (e.key === "Enter") onCreateProject?.(); }}
                  title="Open workspace"
                  style={{
                    color: linkColor,
                    textDecoration: "underline",
                    textDecorationStyle: "solid",
                    textUnderlineOffset: "3px",
                    cursor: "pointer",
                    fontWeight: 600,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {seg.text}
                </span>
              );
            }
            if (seg.type === "file") {
              return (
                <span
                  key={key}
                  style={{
                    color: fileLinkColor,
                    fontFamily: "var(--app-font-mono)",
                    fontSize: "0.88em",
                    background: isParchment
                      ? "rgba(180,83,9,0.06)"
                      : "rgba(212,175,55,0.07)",
                    borderRadius: 4,
                    padding: "1px 4px",
                    cursor: "default",
                    wordBreak: "break-all",
                    overflowWrap: "anywhere",
                  }}
                >
                  {seg.text}
                </span>
              );
            }
            return <React.Fragment key={key}>{seg.text}</React.Fragment>;
          })}
        </>
      );
    },
    [sorted, namePattern, onCreateProject, onNavigate, linkColor, fileLinkColor, isParchment],
  );

  // Intercept atlas-* fenced code blocks (choice / clarify / action). Return
  // `undefined` for anything else so the shared CodeBlockCard handles it.
  const renderPre: AtlasPreRenderer = React.useCallback(
    ({ language, code }) => {
      if (!language.startsWith("atlas-")) return undefined;

      if (language === "atlas-action") {
        const block = parseAtlasAction(code);
        if (block && onAction) {
          return <AtlasActionRow block={block} onAction={onAction} isParchment={isParchment} />;
        }
        return null;
      }

      const card = parseAtlasCard(language, code);
      if (card && onSend) {
        return <AtlasConversationCard card={card} onSend={onSend} isParchment={isParchment} />;
      }
      // Malformed / unsupported atlas-* block → hide silently.
      return null;
    },
    [onAction, onSend, isParchment],
  );

  return (
    <AtlasMarkdown
      content={content}
      theme={isParchment ? "parchment" : "obsidian"}
      tokenize={tokenize}
      renderPre={renderPre}
      onInternalNavigate={(href) => {
        // Route markdown [Name](/project/123) → onNavigate(123) when possible;
        // otherwise dispatch the standard internal-nav event.
        const m = /^\/project\/(\d+)/.exec(href);
        if (m) {
          onNavigate(Number(m[1]));
          return;
        }
        window.dispatchEvent(new CustomEvent("axiom:navigate-internal", { detail: { href } }));
      }}
    />
  );
}
