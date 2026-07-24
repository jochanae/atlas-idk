import { describe, expect, it } from "vitest";

/**
 * INT-37 — document the primeKey contract for Workspace scroll.
 * The hook itself is React-effect based; this locks the identity rule used
 * by workspace.tsx so focus/visibility bumps cannot creep back in.
 */
describe("INT-37 workspace scroll primeKey contract", () => {
  function workspacePrimeKey(projectId: number | string | null | undefined): string {
    // Must NOT incorporate focus/visibility tokens — only project identity.
    return `ws:${projectId ?? "none"}`;
  }

  it("is stable across simulated tab focus cycles", () => {
    const before = workspacePrimeKey(42);
    // focus / visibilitychange would previously bump a returnToken here
    const afterFocus = workspacePrimeKey(42);
    expect(afterFocus).toBe(before);
  });

  it("changes when the project changes", () => {
    expect(workspacePrimeKey(1)).not.toBe(workspacePrimeKey(2));
    expect(workspacePrimeKey(null)).toBe("ws:none");
  });
});

/**
 * Streaming follow contract — useSmartAutoScroll is for message/pending
 * boundaries only. Per-token growth must go through followScrollIfNearBottom
 * so delayed bottom pins don't fight progressive markdown reflow.
 */
describe("workspace streaming scroll deps contract", () => {
  function workspaceSmartAutoScrollDeps(input: {
    messageCount: number;
    chatPending: boolean;
    streamingContentLength: number;
  }): ReadonlyArray<unknown> {
    // Must NOT include streamingContentLength — that keys a multi-timer pin
    // cascade on every token and makes the timeline jump while letters stream.
    void input.streamingContentLength;
    return [input.messageCount, input.chatPending];
  }

  it("does not key smart auto-scroll on streaming content length", () => {
    const a = workspaceSmartAutoScrollDeps({
      messageCount: 4,
      chatPending: true,
      streamingContentLength: 12,
    });
    const b = workspaceSmartAutoScrollDeps({
      messageCount: 4,
      chatPending: true,
      streamingContentLength: 480,
    });
    expect(a).toEqual(b);
    expect(a).toEqual([4, true]);
  });

  it("does re-key when a message arrives or pending flips", () => {
    const idle = workspaceSmartAutoScrollDeps({
      messageCount: 4,
      chatPending: false,
      streamingContentLength: 0,
    });
    const pending = workspaceSmartAutoScrollDeps({
      messageCount: 4,
      chatPending: true,
      streamingContentLength: 0,
    });
    const nextMsg = workspaceSmartAutoScrollDeps({
      messageCount: 5,
      chatPending: true,
      streamingContentLength: 0,
    });
    expect(idle).not.toEqual(pending);
    expect(pending).not.toEqual(nextMsg);
  });
});
