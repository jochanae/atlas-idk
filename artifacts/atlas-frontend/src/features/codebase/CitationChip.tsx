// Tappable file:line citation chip. Emits `codebase:open` so any mounted
// CodebasePanel focuses the file. Also renders inline citations parsed
// from markdown/plain text via <MessageCitations text={...} /> or the
// recursive helper renderChildrenWithCitations(children) for react-markdown
// component overrides.
import React, { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { openCodebase } from "../../hooks/useProjectSource";

export interface CitationChipProps {
  path: string;
  lineStart?: number;
  lineEnd?: number;
  compact?: boolean;
}

export const CitationChip: React.FC<CitationChipProps> = ({ path, lineStart, lineEnd, compact }) => {
  const label = lineStart
    ? `${path}:L${lineStart}${lineEnd && lineEnd !== lineStart ? `-${lineEnd}` : ""}`
    : path;
  return (
    <button
      type="button"
      onClick={() => openCodebase({ path, lineStart, lineEnd })}
      title={`Open ${label} in Codebase panel`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: compact ? "1px 6px" : "2px 8px",
        margin: "0 2px",
        fontFamily: "var(--app-font-mono, ui-monospace, monospace)",
        fontSize: compact ? 10.5 : 11.5,
        lineHeight: 1.4,
        color: "var(--atlas-gold, #c9a24c)",
        background: "rgba(201,162,76,0.08)",
        border: "1px solid rgba(201,162,76,0.25)",
        borderRadius: 4,
        cursor: "pointer",
        verticalAlign: "baseline",
      }}
    >
      <span aria-hidden style={{ opacity: 0.7, fontSize: "0.85em" }}>❯</span>
      {label}
    </button>
  );
};

// Regex matches:  path/to/file.ext        (word after / or start)
//                 path/to/file.ext:L12
//                 path/to/file.ext:L12-L24
// Requires an extension so bare words aren't captured.
const CITATION_RE = /([\w./-]+\.[a-zA-Z][\w]{0,6})(?::L(\d+)(?:-L?(\d+))?)?/g;

export const MessageCitations: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CITATION_RE);
  while ((m = re.exec(text)) !== null) {
    const [full, path, ls, le] = m;
    // Only chip-ify if it looks like a file path (has a slash OR looks like source file)
    if (!path.includes("/") && !ls) { continue; }
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <CitationChip
        key={`${m.index}-${path}`}
        path={path}
        lineStart={ls ? Number(ls) : undefined}
        lineEnd={le ? Number(le) : undefined}
      />,
    );
    last = m.index + full.length;
  }
  if (parts.length === 0) return <>{text}</>;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};

/**
 * Recursively walk ReactMarkdown children and replace citation patterns
 * inside string leaves. Use inside `components` overrides:
 *
 *   p: ({ children }) => <p>{renderChildrenWithCitations(children)}</p>
 *
 * Non-string nodes (including <code>, <a>, <strong>) pass through untouched;
 * their children are recursed. Chips render inline and never duplicate text
 * (matched span is replaced, not appended).
 */
export function renderChildrenWithCitations(children: ReactNode): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      const parts: ReactNode[] = [];
      const re = new RegExp(CITATION_RE);
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(child)) !== null) {
        const [full, path, ls, le] = m;
        if (!path.includes("/") && !ls) continue;
        if (m.index > last) parts.push(child.slice(last, m.index));
        parts.push(
          <CitationChip
            key={`c-${idx}-${m.index}`}
            path={path}
            lineStart={ls ? Number(ls) : undefined}
            lineEnd={le ? Number(le) : undefined}
          />,
        );
        last = m.index + full.length;
      }
      if (parts.length === 0) return child;
      if (last < child.length) parts.push(child.slice(last));
      return <>{parts}</>;
    }
    // Don't descend into code blocks / inline code — file:line inside code
    // should stay verbatim so users can copy it.
    if (isValidElement<{ children?: ReactNode }>(child)) {
      const type = (child.type as { displayName?: string; name?: string })?.name
        ?? (typeof child.type === "string" ? child.type : "");
      if (type === "code" || type === "pre") return child;
      return cloneElement(child, {
        children: renderChildrenWithCitations(child.props.children),
      });
    }
    return child;
  });
}
