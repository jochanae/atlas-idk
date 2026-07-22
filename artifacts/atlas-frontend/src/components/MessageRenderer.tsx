// ─────────────────────────────────────────────────────────────────────────────
// MessageRenderer.tsx
//
// Workspace-facing markdown wrappers. All markdown structure and styling now
// flows through the shared <AtlasMarkdown/> primitive. Only Workspace-specific
// tokenization (file pills + codebase citation chips) and the ArchiveSummary
// card layout live here.
//
// Historical exports (MarkdownProse, StreamingMarkdown, CodeBlockCard,
// ArchiveSummaryCard) are preserved for callers.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, type ReactNode } from "react";
import { CitationChip } from "@/features/codebase";
import {
  AtlasMarkdown,
  CodeBlockCard as SharedCodeBlockCard,
  StreamingMarkdown as SharedStreamingMarkdown,
  type AtlasTokenizer,
} from "./AtlasMarkdown";

export const CodeBlockCard = SharedCodeBlockCard;
export const StreamingMarkdown = SharedStreamingMarkdown;

// ── Workspace tokenizer: file pills + codebase citations ──────────────────────

const FILE_PILL_PATTERN = /(\b[\w-]+\.(?:tsx|ts|js|jsx|css|json|md|sql)\b)/gi;
const FILE_PILL_EXACT_PATTERN = /^\b[\w-]+\.(?:tsx|ts|js|jsx|css|json|md|sql)\b$/i;
// Codebase citation: path/with/slashes.ext OR file.ext:L12 (with optional -L24).
const CITATION_PATTERN = /([\w./-]+\.[a-zA-Z][a-zA-Z0-9]{0,5})(?::L(\d+)(?:-L?(\d+))?)?/g;

function splitByFilePill(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(FILE_PILL_PATTERN);
  return parts.map((part, index) =>
    FILE_PILL_EXACT_PATTERN.test(part) ? (
      <span
        key={`${keyBase}-p${index}`}
        className="rounded px-1.5 py-0.5 font-mono text-[12px] bg-[hsl(var(--token-bg))] text-[hsl(var(--token-fg))] border border-[hsl(var(--token-border))]"
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

const workspaceTokenizer: AtlasTokenizer = (text, keyBase) => {
  const out: ReactNode[] = [];
  const re = new RegExp(CITATION_PATTERN.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [full, path, ls, le] = m;
    // Only treat as citation if path has a slash OR carries a :L line ref.
    if (!path.includes("/") && !ls) continue;
    if (m.index > last) {
      out.push(...splitByFilePill(text.slice(last, m.index), `${keyBase}-s${last}`));
    }
    out.push(
      <CitationChip
        key={`${keyBase}-c${m.index}`}
        path={path}
        lineStart={ls ? Number(ls) : undefined}
        lineEnd={le ? Number(le) : undefined}
      />,
    );
    last = m.index + full.length;
  }
  if (last < text.length) {
    out.push(...splitByFilePill(text.slice(last), `${keyBase}-s${last}`));
  }
  return out;
};

// ── MarkdownProse ─────────────────────────────────────────────────────────────

export function MarkdownProse({ content }: { content: string }) {
  return <AtlasMarkdown content={content} theme="obsidian" tokenize={workspaceTokenizer} />;
}

// ── ArchiveSummaryCard ────────────────────────────────────────────────────────

export function ArchiveSummaryCard({
  archives,
  content,
}: {
  archives: string[];
  content: string;
}) {
  const sections = useMemo(() => {
    const out: Record<string, string> = {
      Uploaded: "",
      Touches: "",
      Drift: "",
      Question: "",
    };
    const re = /^###\s+(Uploaded|Touches|Drift|Question)\s*$/gim;
    const matches: Array<{ key: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      matches.push({ key: m[1], start: m.index + m[0].length, end: content.length });
    }
    for (let i = 0; i < matches.length; i++) {
      if (i + 1 < matches.length) {
        matches[i].end = matches[i + 1].start - matches[i + 1].key.length - 4;
      }
      out[matches[i].key] = content.slice(matches[i].start, matches[i].end).trim();
    }
    return out;
  }, [content]);

  const hasAnySection = Object.values(sections).some((v) => v.trim().length > 0);

  return (
    <div
      className="mb-3 overflow-hidden rounded-2xl"
      style={{
        background: "color-mix(in oklab, var(--atlas-gold) 3%, var(--atlas-bg))",
        border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 28%, var(--atlas-border))",
        boxShadow: "0 8px 32px -16px rgba(0,0,0,0.4)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          borderBottom: "0.5px solid color-mix(in oklab, var(--atlas-gold) 18%, var(--atlas-border))",
          background: "color-mix(in oklab, var(--atlas-gold) 6%, transparent)",
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--atlas-gold)",
          }}
        >
          Context Ingestion
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: 10,
            color: "var(--atlas-muted)",
            letterSpacing: "0.06em",
            maxWidth: "60%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {archives.join(", ")}
        </span>
      </div>
      <div className="px-4 py-4">
        {hasAnySection ? (
          <div className="space-y-4">
            {(["Uploaded", "Touches", "Drift", "Question"] as const).map((key) =>
              sections[key].trim() ? (
                <div key={key}>
                  <div
                    className="font-mono mb-1.5"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color:
                        key === "Drift"
                          ? "color-mix(in oklab, var(--atlas-gold) 80%, #d97757)"
                          : "var(--atlas-gold)",
                    }}
                  >
                    {key}
                  </div>
                  <MarkdownProse content={sections[key]} />
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <MarkdownProse content={content} />
        )}
      </div>
    </div>
  );
}
