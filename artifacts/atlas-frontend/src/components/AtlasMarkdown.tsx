// ─────────────────────────────────────────────────────────────────────────────
// AtlasMarkdown.tsx
//
// Shared markdown primitive for BOTH Ask Atlas and Workspace surfaces.
// Replaces the parallel implementations in `MessageRenderer.tsx` and
// `home/AskAtlasRenderer.tsx`. Streaming and final renders now share the same
// component tree — no plain-text streaming branch, no post-completion typography
// swap.
//
// Contract:
//   • remarkGfm + remarkBreaks (tables, task lists, strikethrough, autolinks,
//     hard line breaks)
//   • one shared component map for p / headings / lists / tables / hr / links /
//     inline code / fenced code
//   • preserves CodeBlockCard (copy + collapse)
//   • surface-specific string tokenization via optional `tokenize` prop
//   • surface-specific fenced-code interception via optional `renderPre` prop
//     (Ask Atlas uses this for atlas-* cards)
//   • theme: 'obsidian' | 'parchment'
//
// See docs/handoffs/2026-07-22-shared-markdown-renderer.md
// ─────────────────────────────────────────────────────────────────────────────

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

export type AtlasMarkdownTheme = "obsidian" | "parchment";

export type AtlasTokenizer = (text: string, keyBase: string) => ReactNode;

export type AtlasPreRenderer = (args: {
  language: string;
  code: string;
  children: ReactNode;
}) => ReactNode | undefined;

export interface AtlasMarkdownProps {
  content: string;
  theme?: AtlasMarkdownTheme;
  /** Transform bare string nodes (project names, file paths, citations, etc.). */
  tokenize?: AtlasTokenizer;
  /**
   * Intercept fenced code blocks before the default <CodeBlockCard/> renders.
   * Return `undefined` to fall through to the default. Ask Atlas uses this for
   * atlas-choice / atlas-clarify / atlas-action cards.
   */
  renderPre?: AtlasPreRenderer;
  /** Route markdown [text](/internal) clicks. Defaults to dispatching axiom:navigate-internal. */
  onInternalNavigate?: (href: string) => void;
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function extractText(node: ReactNode): string {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return "";
}

/** Recursively apply a tokenizer to every raw string node inside a React tree. */
function applyTokenize(children: ReactNode, tokenize: AtlasTokenizer, keyBase: string): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === "string") return tokenize(child, `${keyBase}-${i}`);
    if (isValidElement<{ children?: ReactNode }>(child)) {
      return cloneElement(child, {
        children: applyTokenize(child.props.children, tokenize, `${keyBase}-${i}`),
      });
    }
    return child;
  });
}

// ── CodeBlockCard ─────────────────────────────────────────────────────────────

export function CodeBlockCard({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_LINES = 8;
  const codeContent = code ?? "";
  const lines = codeContent ? codeContent.split("\n") : [];
  const lineCount = lines.length;
  const isOverflow = lineCount > PREVIEW_LINES;
  const visibleCode = !isOverflow || expanded
    ? codeContent
    : lines.slice(0, PREVIEW_LINES).join("\n");
  const hiddenCount = isOverflow && !expanded ? lineCount - PREVIEW_LINES : 0;
  const label = language ? language.toUpperCase() : "CODE";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="mb-3 overflow-hidden rounded-lg bg-[hsl(var(--code-bg))] text-[hsl(var(--code-fg))] border border-[hsl(var(--code-border))]">
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom: "0.5px solid var(--atlas-border)",
          background: "color-mix(in oklab, var(--atlas-gold) 4%, transparent)",
        }}
      >
        <span
          className="font-mono"
          style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--atlas-gold)" }}
        >
          {label} · {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: "transparent",
            border: "0.5px solid var(--atlas-border)",
            color: copied ? "var(--atlas-gold)" : "var(--atlas-muted)",
            cursor: "pointer",
            transition: "all var(--motion-fast) var(--ease-standard)",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div style={{ position: "relative" }}>
        <pre
          className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed backdrop-blur-md"
          style={{ margin: 0, color: "hsl(var(--code-fg))", background: "hsl(var(--code-bg) / 0.75)" }}
        >
          <code>{visibleCode}</code>
        </pre>
        {isOverflow && !expanded && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0, right: 0, bottom: 0, height: 36,
              pointerEvents: "none",
              background: "linear-gradient(to bottom, transparent, var(--atlas-surface))",
            }}
          />
        )}
      </div>
      {isOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full font-mono"
          style={{
            padding: "8px 12px",
            background: "transparent",
            border: "none",
            borderTop: "0.5px solid var(--atlas-border)",
            color: "var(--atlas-gold)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {expanded
            ? "Collapse"
            : `Expand · +${hiddenCount} more line${hiddenCount === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

// ── AtlasMarkdown ─────────────────────────────────────────────────────────────

/**
 * Shared markdown renderer. Both Ask Atlas and Workspace mount this component
 * — streaming and final states use the same tree so partial markdown renders
 * progressively without a typography swap on completion.
 */
export function AtlasMarkdown({
  content,
  theme = "obsidian",
  tokenize,
  renderPre,
  onInternalNavigate,
  className,
}: AtlasMarkdownProps) {
  // Component map memoized on identity of tokenize/renderPre/theme so a streaming
  // parent re-render doesn't force ReactMarkdown to unmount its child tree
  // (which would silently reset CodeBlockCard's `expanded` and any local state).
  const components = useMemo<Components>(() => {
    const tk = (node: ReactNode, key: string): ReactNode =>
      tokenize ? applyTokenize(node, tokenize, key) : node;

    const linkColor = theme === "parchment" ? "rgba(146,64,14,0.95)" : "var(--atlas-gold)";
    const hrColor = theme === "parchment" ? "rgba(146,64,14,0.18)" : "rgba(212,175,55,0.18)";
    const tableBorder = theme === "parchment"
      ? "1px solid rgba(146,64,14,0.2)"
      : "1px solid rgba(212,175,55,0.15)";
    const rowBorder = theme === "parchment"
      ? "1px solid rgba(146,64,14,0.12)"
      : "1px solid rgba(255,255,255,0.06)";
    const thBorder = theme === "parchment"
      ? "1px solid rgba(146,64,14,0.25)"
      : "1px solid rgba(212,175,55,0.25)";

    return {
      p: ({ children }) => <p>{tk(children, "p")}</p>,
      h1: ({ children }) => <h1>{tk(children, "h1")}</h1>,
      h2: ({ children }) => <h2>{tk(children, "h2")}</h2>,
      h3: ({ children }) => <h3>{tk(children, "h3")}</h3>,
      h4: ({ children }) => <h4>{tk(children, "h4")}</h4>,
      h5: ({ children }) => <h5>{tk(children, "h5")}</h5>,
      h6: ({ children }) => <h6>{tk(children, "h6")}</h6>,
      strong: ({ children }) => <strong>{tk(children, "st")}</strong>,
      em: ({ children }) => <em>{tk(children, "em")}</em>,
      del: ({ children }) => <del>{tk(children, "del")}</del>,

      ul: ({ children }) => <ul>{children}</ul>,
      ol: ({ children }) => <ol>{children}</ol>,
      li: ({ children, className: liClass, ...rest }) => (
        <li className={liClass} {...(rest as Record<string, unknown>)}>
          {tk(children, "li")}
        </li>
      ),

      hr: () => (
        <hr style={{ border: "none", borderTop: `1px solid ${hrColor}`, margin: "1em 0" }} />
      ),

      a: ({ href, children }) => {
        const isInternal = typeof href === "string" && href.startsWith("/");
        if (isInternal) {
          return (
            <button
              type="button"
              onClick={() => {
                if (!href) return;
                if (onInternalNavigate) onInternalNavigate(href);
                else
                  window.dispatchEvent(
                    new CustomEvent("axiom:navigate-internal", { detail: { href } }),
                  );
              }}
              style={{
                display: "inline",
                background: "none",
                border: "none",
                padding: 0,
                color: linkColor,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "inherit",
                lineHeight: "inherit",
                letterSpacing: "inherit",
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: "3px",
              }}
            >
              {tk(children, "a-int")}
            </button>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: linkColor,
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textUnderlineOffset: "3px",
            }}
          >
            {tk(children, "a-ext")}
          </a>
        );
      },

      code: ({ children, className: cls }) => {
        const isBlock = Boolean(cls);
        if (isBlock) {
          return (
            <code
              className={`${cls ?? ""} block whitespace-pre-wrap font-mono text-[13px]`}
              style={{ color: "var(--atlas-fg)" }}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            className="rounded px-1.5 py-0.5 font-mono bg-[hsl(var(--token-bg))] text-[hsl(var(--token-fg))] border border-[hsl(var(--token-border))]"
            style={{ fontSize: "0.88em" }}
          >
            {children}
          </code>
        );
      },

      pre: ({ children }) => {
        // Extract language + raw code from the single <code> child.
        let lang = "";
        let raw = "";
        const childArray = Children.toArray(children);
        for (const c of childArray) {
          if (isValidElement<{ className?: string; children?: ReactNode }>(c)) {
            const cn = (c.props as { className?: string }).className ?? "";
            const m = /language-([\w+-]+)/.exec(cn);
            if (m) lang = m[1];
            raw += extractText((c.props as { children?: ReactNode }).children);
          } else if (typeof c === "string") {
            raw += c;
          }
        }
        raw = raw.replace(/\n+$/, "");

        if (renderPre) {
          const custom = renderPre({ language: lang, code: raw, children });
          if (custom !== undefined) return <>{custom}</>;
        }

        return <CodeBlockCard language={lang || "code"} code={raw} />;
      },

      table: ({ children }) => (
        <div
          style={{
            overflowX: "auto",
            maxWidth: "100%",
            WebkitOverflowScrolling: "touch",
            margin: "0.75em 0",
            borderRadius: 6,
            border: tableBorder,
          }}
        >
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: "max-content",
              fontSize: "0.9em",
            }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr style={{ borderBottom: rowBorder }}>{children}</tr>,
      th: ({ children }) => (
        <th
          style={{
            padding: "7px 12px",
            textAlign: "left",
            fontWeight: 600,
            color: linkColor,
            whiteSpace: "nowrap",
            borderBottom: thBorder,
          }}
        >
          {tk(children, "th")}
        </th>
      ),
      td: ({ children }) => (
        <td style={{ padding: "6px 12px", verticalAlign: "top" }}>{tk(children, "td")}</td>
      ),
    };
  }, [theme, tokenize, renderPre, onInternalNavigate]);

  return (
    <div
      className={`atlas-prose atlas-md atlas-md-${theme}${className ? ` ${className}` : ""}`}
      data-atlas-theme={theme}
      style={{
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        minWidth: 0,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── StreamingMarkdown (unchanged behavior — uses shared AtlasMarkdown) ────────

/**
 * Optional typewriter wrapper — used only when a caller explicitly wants a
 * word-by-word reveal. Standard streaming uses AtlasMarkdown directly against
 * the live-growing content string so partial markdown renders progressively.
 */
export function StreamingMarkdown({
  content,
  speed = 30,
  onComplete,
  theme,
  tokenize,
  renderPre,
}: {
  content: string;
  speed?: number;
  onComplete?: () => void;
} & Pick<AtlasMarkdownProps, "theme" | "tokenize" | "renderPre">) {
  const words = useMemo(() => content.match(/\S+\s*/g) ?? [], [content]);
  const [visibleCount, setVisibleCount] = useState(0);
  const completeCalled = useRef(false);

  useEffect(() => {
    setVisibleCount(0);
    completeCalled.current = false;
  }, [content]);

  useEffect(() => {
    const total = words.length;
    if (visibleCount >= total) {
      if (!completeCalled.current) {
        completeCalled.current = true;
        onComplete?.();
      }
      return;
    }
    const lastWord = words[visibleCount - 1] ?? "";
    const jitter = speed * (0.6 + Math.random() * 0.8);
    const pause = /[.!?]\s*$/.test(lastWord) ? speed * 4 : jitter;
    const burst = Math.random() > 0.7 ? 2 : 1;
    const timer = setTimeout(() => {
      setVisibleCount((c) => Math.min(c + burst, total));
    }, pause);
    return () => clearTimeout(timer);
  }, [visibleCount, words, speed, onComplete]);

  const visibleText = words.slice(0, visibleCount).join("");
  const isDone = visibleCount >= words.length;

  return (
    <div style={{ position: "relative" }}>
      <AtlasMarkdown content={visibleText} theme={theme} tokenize={tokenize} renderPre={renderPre} />
      {!isDone && <span className="atlas-cursor" aria-hidden />}
    </div>
  );
}

