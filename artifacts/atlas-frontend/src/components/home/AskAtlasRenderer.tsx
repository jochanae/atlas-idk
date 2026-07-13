import React from "react";
import ReactMarkdown from "react-markdown";
import { useLocation } from "wouter";

type Project = { id: number; name: string };

interface Props {
  content: string;
  projects: Project[];
  onNavigate: (projectId: number) => void;
  isParchment?: boolean;
  onCreateProject?: (nameOverride?: string) => void;
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
}: Props) {
  if (!content) return null;

  void useLocation;

  const sorted = [...projects].sort((a, b) => b.name.length - a.name.length);
  const namePattern = sorted
    .map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .join("|");

  const linkColor = isParchment ? "rgba(146,64,14,0.9)" : "rgba(212,175,55,0.95)";
  const fileLinkColor = isParchment ? "rgba(100,80,14,0.75)" : "rgba(180,160,80,0.8)";

  type Seg =
    | { type: "text"; text: string }
    | { type: "project"; text: string; projectId: number }
    | { type: "file"; text: string }
    | { type: "create"; text: string };

  // Tokenize a plain string into React nodes — project links, folder CTA, file chips.
  function tokenizeText(text: string): React.ReactNode {
    // Pass 1: folder CTA phrase
    const stage1: Seg[] = [];
    if (onCreateProject) {
      FOLDER_CTA_RE.lastIndex = 0;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = FOLDER_CTA_RE.exec(text)) !== null) {
        if (m.index > last) stage1.push({ type: "text", text: text.slice(last, m.index) });
        stage1.push({ type: "create", text: m[0] });
        last = m.index + m[0].length;
      }
      if (last < text.length) stage1.push({ type: "text", text: text.slice(last) });
    } else {
      stage1.push({ type: "text", text });
    }

    // Pass 2: project names within text segments
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

    // Pass 3: file paths within remaining text segments
    const stage3: Seg[] = [];
    for (const seg of stage2) {
      if (seg.type !== "text") { stage3.push(seg); continue; }
      FILE_PATH_RE.lastIndex = 0;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = FILE_PATH_RE.exec(seg.text)) !== null) {
        if (m.index > last) stage3.push({ type: "text", text: seg.text.slice(last, m.index) });
        stage3.push({ type: "file", text: m[1] ?? m[2] });
        last = m.index + m[0].length;
      }
      if (last < seg.text.length) stage3.push({ type: "text", text: seg.text.slice(last) });
    }

    // If nothing special was found, return the plain string to avoid wrapping.
    if (stage3.every((s) => s.type === "text")) return text;

    return (
      <>
        {stage3.map((seg, i) => {
          if (seg.type === "project") {
            return (
              <span
                key={i}
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
                key={i}
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
                key={i}
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
                }}
              >
                {seg.text}
              </span>
            );
          }
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        })}
      </>
    );
  }

  // Walk ReactMarkdown's children prop — apply tokenizeText to any bare string nodes
  // while leaving existing React elements (links, etc.) untouched.
  function processChildren(children: React.ReactNode): React.ReactNode {
    const mapped = React.Children.map(children, (child) => {
      if (typeof child === "string") return tokenizeText(child);
      return child;
    });
    return mapped ?? children;
  }

  return (
    // Reset whiteSpace to normal so markdown block structure renders correctly.
    // The parent container has pre-wrap for the streaming path; we override here.
    <div style={{ whiteSpace: "normal" }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p>{processChildren(children)}</p>,
          li: ({ children }) => <li>{processChildren(children)}</li>,
          strong: ({ children }) => <strong>{processChildren(children)}</strong>,
          em: ({ children }) => <em>{processChildren(children)}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: linkColor,
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {processChildren(children)}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
