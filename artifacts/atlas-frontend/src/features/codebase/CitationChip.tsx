/**
 * CitationChip — renders `path:L{start}-L{end}` and opens the file
 * range in the Codebase panel when tapped.
 *
 * Emits a `codebase:open` CustomEvent on window. CodebasePanel listens
 * and opens itself to the File tab at the requested range.
 */
import { FileCode } from "lucide-react";

export interface Citation {
  path: string;
  lineStart: number;
  lineEnd: number;
  snippet?: string;
}

export function openCitation(c: Citation) {
  window.dispatchEvent(new CustomEvent("codebase:open", { detail: c }));
}

export function CitationChip({ citation }: { citation: Citation }) {
  const { path, lineStart, lineEnd } = citation;
  const label = `${path}:L${lineStart}-L${lineEnd}`;
  return (
    <button
      type="button"
      onClick={() => openCitation(citation)}
      title={citation.snippet ?? label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        margin: "2px 4px 2px 0",
        borderRadius: 6,
        border: "1px solid rgba(212,175,55,0.35)",
        background: "rgba(212,175,55,0.08)",
        color: "var(--atlas-gold, #d4af37)",
        fontFamily: "var(--app-font-mono, monospace)",
        fontSize: 11,
        cursor: "pointer",
        lineHeight: 1.4,
      }}
    >
      <FileCode size={11} />
      <span>{label}</span>
    </button>
  );
}

export function CitationChips({ citations }: { citations: Citation[] }) {
  if (!citations?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", marginTop: 6 }}>
      {citations.map((c, i) => (
        <CitationChip key={`${c.path}:${c.lineStart}:${i}`} citation={c} />
      ))}
    </div>
  );
}
