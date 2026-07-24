/**
 * INT-13 handoff kickoff readiness.
 *
 * Manual failure mode: kickoff fired before Nexus conversation identity +
 * Living Thread history were ready. The model received only
 * HANDOFF_CONTINUATION_MESSAGE and replied "I don't have a prior session…",
 * while the UI later showed the real transcript.
 *
 * Rule: never fire a "continue from where we left off" turn into an empty
 * model context. Wait until conversationId is pinned and bridge history has
 * at least one real turn.
 */

import { HANDOFF_CONTINUATION_MESSAGE } from "@/lib/askAtlasHelpers";

export type HandoffKickoffGate =
  | { ok: true }
  | { ok: false; reason: "waiting_conversation_id" | "waiting_history" | "empty_transcript" };

export function shouldFireHandoffKickoff(opts: {
  nexusConversationId: string | null | undefined;
  historyReady: boolean;
  bridgeMessageCount: number;
  isHandoffContinuation: boolean;
}): HandoffKickoffGate {
  if (!opts.nexusConversationId) {
    return { ok: false, reason: "waiting_conversation_id" };
  }
  if (!opts.historyReady) {
    return { ok: false, reason: "waiting_history" };
  }
  // Continuation into an empty thread is the verified INT-13 failure mode.
  if (opts.isHandoffContinuation && opts.bridgeMessageCount <= 0) {
    return { ok: false, reason: "empty_transcript" };
  }
  return { ok: true };
}

/** True when content is the internal home→workspace kickoff (must not show as user chat). */
export function isHandoffContinuationMessage(content: string | null | undefined): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (trimmed === HANDOFF_CONTINUATION_MESSAGE) return true;
  const lower = trimmed.toLowerCase();
  // Current contract (P9).
  if (
    lower.startsWith("continue the prior thread") &&
    lower.includes("do not acknowledge the handoff")
  ) {
    return true;
  }
  // Brief / named-project continuation primes (still hidden from UI).
  if (
    lower.includes("do not acknowledge") &&
    (lower.includes("ask what is first") ||
      lower.includes("ask what we are building") ||
      lower.includes("ask what's first"))
  ) {
    return true;
  }
  // Named-project continue primes without the acknowledge clause.
  if (
    lower.startsWith("continue in ") &&
    (lower.includes("do not ask what is first") ||
      lower.includes("do not ask what we are building"))
  ) {
    return true;
  }
  // Legacy wording (pre–2.4 Phase A) — still hide if replayed from storage.
  return (
    lower.startsWith("continue from where we left off") &&
    lower.includes("acknowledge the handoff")
  );
}
