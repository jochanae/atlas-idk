/**
 * useBuildLifecycle — HUD build-phase state machine.
 *
 * Watches existing build signals already present in workspace state and pushes
 * BUILD_PHASE events to the hudBus so the Listening HUD shows meaningful
 * progress instead of freezing on "Capturing Intent" for the full build duration.
 *
 * Phase machine:
 *   null / ready → preparing   (chatPending goes true while in a build cycle)
 *   preparing   → writing      (FILE_EDIT detected in activity stream)
 *   writing     → verifying    (pendingAutoApply fires — files written, audit running)
 *   verifying   → writing      (chatPending goes true again — another FILE_EDIT round)
 *   writing | verifying → ready (completion text detected AND chatPending=false)
 *   any active  → stalled      (90 s without a phase transition)
 */

import { useEffect, useRef } from "react";
import { pushHudEvent } from "@/lib/hudBus";

type BuildPhase = "preparing" | "writing" | "verifying" | "ready" | "stalled" | null;

const STALL_TIMEOUT_MS = 90_000;

const COMPLETION_RE =
  /build complete|workspace is ready|✅|all files written|preview is ready/i;

interface BuildLifecycleInput {
  chatPending: boolean;
  activityStreamContent: string;
  pendingAutoApply: string[] | null;
  messages: Array<{ role: string; content?: string | null }>;
}

export function useBuildLifecycle({
  chatPending,
  activityStreamContent,
  pendingAutoApply,
  messages,
}: BuildLifecycleInput): void {
  const phaseRef = useRef<BuildPhase>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevChatPendingRef = useRef(false);
  const prevAutoApplyRef = useRef<string[] | null>(null);
  const inBuildCycleRef = useRef(false);

  function clearStall() {
    if (stallTimerRef.current !== null) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }

  function armStall() {
    clearStall();
    stallTimerRef.current = setTimeout(() => {
      const p = phaseRef.current;
      if (p === null || p === "ready" || p === "stalled") return;
      phaseRef.current = "stalled";
      pushHudEvent(
        "BUILD_PHASE",
        "Build stalled — no progress in 90 s. Try resending or check the Files tab.",
      );
    }, STALL_TIMEOUT_MS);
  }

  function go(phase: BuildPhase, label: string) {
    if (phaseRef.current === phase) return;
    phaseRef.current = phase;
    pushHudEvent("BUILD_PHASE", label);
    if (phase !== null && phase !== "ready" && phase !== "stalled") {
      armStall();
    } else {
      clearStall();
    }
  }

  // ── chatPending transition ────────────────────────────────────────────────
  useEffect(() => {
    const was = prevChatPendingRef.current;
    prevChatPendingRef.current = chatPending;

    if (chatPending && !was) {
      // New send started.
      if (inBuildCycleRef.current) {
        // We're already in a build loop — this is a verification re-round.
        go("preparing", "Preparing next build round…");
      }
      // If not yet in a build cycle, wait for FILE_EDIT signal before reacting.
    }
  }, [chatPending]);

  // ── FILE_EDIT in activity stream ──────────────────────────────────────────
  const prevStreamContentRef = useRef("");
  useEffect(() => {
    const prev = prevStreamContentRef.current;
    prevStreamContentRef.current = activityStreamContent;

    if (activityStreamContent && activityStreamContent !== prev) {
      if (/FILE_EDIT/i.test(activityStreamContent)) {
        inBuildCycleRef.current = true;
        go("writing", "Writing files…");
      }
    }
  }, [activityStreamContent]);

  // ── pendingAutoApply transition ───────────────────────────────────────────
  useEffect(() => {
    const prev = prevAutoApplyRef.current;
    prevAutoApplyRef.current = pendingAutoApply;

    if (pendingAutoApply !== null && prev === null) {
      go("verifying", "Verifying build integrity…");
    }
  }, [pendingAutoApply]);

  // ── Completion detection ──────────────────────────────────────────────────
  useEffect(() => {
    const p = phaseRef.current;
    if (p === null || p === "ready" || p === "stalled") return;
    if (chatPending) return;
    if (!inBuildCycleRef.current) return;

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const text =
      typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
    if (COMPLETION_RE.test(text)) {
      inBuildCycleRef.current = false;
      go("ready", "Preview ready — workspace built successfully.");
    }
  }, [messages, chatPending]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearStall();
    };
  }, []);
}
