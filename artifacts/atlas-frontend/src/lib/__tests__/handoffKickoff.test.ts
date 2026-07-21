import { describe, expect, it } from "vitest";
import {
  isHandoffContinuationMessage,
  shouldFireHandoffKickoff,
} from "@/lib/handoffKickoff";
import { HANDOFF_CONTINUATION_MESSAGE } from "@/lib/askAtlasHelpers";

/**
 * INT-13 acceptance (runtime):
 * Create Workspace from Ask Atlas → first Workspace inference must consume the
 * imported transcript. Kickoff must NOT fire into an empty model context.
 *
 * Manual failure: transcript visible in UI, but Atlas said it had no prior session.
 */
describe("INT-13 handoff kickoff gate", () => {
  it("blocks kickoff until conversation id is pinned", () => {
    expect(
      shouldFireHandoffKickoff({
        nexusConversationId: "",
        historyReady: true,
        bridgeMessageCount: 4,
        isHandoffContinuation: true,
      }),
    ).toEqual({ ok: false, reason: "waiting_conversation_id" });
  });

  it("blocks kickoff until Nexus history load completes", () => {
    expect(
      shouldFireHandoffKickoff({
        nexusConversationId: "conv-1",
        historyReady: false,
        bridgeMessageCount: 0,
        isHandoffContinuation: true,
      }),
    ).toEqual({ ok: false, reason: "waiting_history" });
  });

  it("blocks continuation kickoff when history is ready but transcript is empty (manual failure mode)", () => {
    expect(
      shouldFireHandoffKickoff({
        nexusConversationId: "conv-1",
        historyReady: true,
        bridgeMessageCount: 0,
        isHandoffContinuation: true,
      }),
    ).toEqual({ ok: false, reason: "empty_transcript" });
  });

  it("allows continuation kickoff only when transcript is already in the bridge", () => {
    expect(
      shouldFireHandoffKickoff({
        nexusConversationId: "conv-1",
        historyReady: true,
        bridgeMessageCount: 3,
        isHandoffContinuation: true,
      }),
    ).toEqual({ ok: true });
  });

  it("allows non-continuation opening messages on an empty brand-new thread", () => {
    expect(
      shouldFireHandoffKickoff({
        nexusConversationId: "conv-new",
        historyReady: true,
        bridgeMessageCount: 0,
        isHandoffContinuation: false,
      }),
    ).toEqual({ ok: true });
  });

  it("recognizes the internal home-handoff kickoff text so UI can hide it", () => {
    expect(isHandoffContinuationMessage(HANDOFF_CONTINUATION_MESSAGE)).toBe(true);
    expect(isHandoffContinuationMessage("hello")).toBe(false);
  });
});
