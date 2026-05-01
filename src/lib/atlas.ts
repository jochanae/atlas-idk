export type LedgerStatus = "Active" | "Superseded" | "Violated";

export type Project = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  user_id: string;
};

export type LedgerEntry = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: LedgerStatus;
  cost_of_lesson: number | null;
  is_violation: boolean;
  created_at: string;
  /** RAG severity for the StatusGlyph (defaults to 'committed' for legacy rows). */
  severity?: "blocker" | "parked" | "committed" | "neutral" | null;
  /** Builder verb for the glyph. */
  verb?: "new" | "bug" | "perf" | "note" | "wip" | "audit" | "merge" | null;
  /** Short build identifier like 'BUILD-A4F2'. */
  build_id?: string | null;
  /** CommitCard schema version this entry was created from. */
  card_schema_version?: number | null;
  projects?: { name: string } | null;
};

export type Session = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  status: string;
  created_at: string;
};

export type NodeType = "file" | "draft" | "output" | "component" | "note";
export type NodeStatus = "draft" | "active" | "archived";

export type WorkspaceNode = {
  id: string;
  project_id: string;
  session_id: string | null;
  user_id: string;
  type: NodeType;
  title: string;
  content: unknown;
  version: number;
  status: NodeStatus;
  created_at: string;
  updated_at: string;
};

export type RecStatus = "pending" | "accepted" | "parked" | "dismissed";

export type Recommendation = {
  id: string;
  project_id: string;
  session_id: string;
  user_id: string;
  content: string;
  definition: string | null;
  benefit: string | null;
  priority: "high" | "medium" | "low";
  status: RecStatus;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  intent_type: string | null;
  created_at: string;
  /** Structured CommitCard payload (set when the AI delivered a card). */
  card_payload?: Record<string, unknown> | null;
  /** Schema version of card_payload — renderer branches on this. */
  card_schema_version?: number | null;
  /** Set when this assistant turn has been locked to a ledger entry. */
  committed_card_id?: string | null;
  /** Ledger entries pulled into context for this reply (rendered as MemoryChips). */
  surfaced_memories?: Array<{ id: string; title: string; created_at: string }> | null;
  /** Output guard violation type (null = passed validation) */
  output_guard_violation?: string | null;
  /** Whether the output was auto-repaired by the retry loop */
  output_guard_repaired?: boolean;
};

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

export function formatCost(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
