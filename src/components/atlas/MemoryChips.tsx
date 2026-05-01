import { Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * A surfaced memory chip — rendered above an Atlas reply when the assistant
 * pulled a committed ledger entry into context to answer the message.
 *
 * Tap behavior: navigates to /ledger?focus=<entryId> so the user can see
 * exactly what Atlas remembered. The Ledger route can read the `focus`
 * search param to scroll/highlight the matching entry.
 *
 * Visual: deliberately quiet. This is a trust signal, not a CTA. It should
 * read like a small confidence cue, not a button.
 */
export type SurfacedMemory = {
  id: string;
  title: string;
  created_at: string;
};

function relativeMemoryAge(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "last month";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function MemoryChips({ memories }: { memories: SurfacedMemory[] }) {
  if (!memories || memories.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pb-1">
      {memories.map((m) => (
        <Link
          key={m.id}
          to="/ledger"
          search={{ focus: m.id } as never}
          className="atlas-status-pill group inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 18%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 10%, transparent)";
          }}
          title={`Open ledger entry: ${m.title}`}
        >
          <Sparkles className="h-2.5 w-2.5" />
          <span className="opacity-80">Remembered</span>
          <span className="opacity-60">·</span>
          <span className="max-w-[180px] truncate normal-case tracking-normal">
            {m.title}
          </span>
          <span className="opacity-60">·</span>
          <span>{relativeMemoryAge(m.created_at)}</span>
        </Link>
      ))}
    </div>
  );
}
