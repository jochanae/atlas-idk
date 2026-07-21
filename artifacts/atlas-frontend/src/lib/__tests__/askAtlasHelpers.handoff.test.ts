import { afterEach, describe, expect, it } from "vitest";
import {
  HANDOFF_CONTINUATION_MESSAGE,
  navigateAfterAskAtlasHandoff,
  redirectAfterHandoff,
  seedHandoffContinuation,
  selectHandoffMessages,
} from "@/lib/askAtlasHelpers";

function clearHandoffKeys() {
  try {
    sessionStorage.removeItem("atlas-opening-message");
    sessionStorage.removeItem("atlas-opening-message-project-id");
    sessionStorage.removeItem("atlas-handoff-continuation");
  } catch {
    /* ignore */
  }
}

/**
 * INT-13 acceptance:
 * Create a workspace from Ask Atlas → Atlas automatically continues its thought
 * after navigation without requiring another user message.
 *
 * These unit tests lock the seed contract the Workspace opening pipeline needs.
 */
describe("INT-13 handoff continuation seed", () => {
  afterEach(() => {
    clearHandoffKeys();
  });

  it("seedHandoffContinuation sets opening message + project id + continuation flag", () => {
    seedHandoffContinuation(42);
    expect(sessionStorage.getItem("atlas-opening-message")).toBe(HANDOFF_CONTINUATION_MESSAGE);
    expect(sessionStorage.getItem("atlas-opening-message-project-id")).toBe("42");
    expect(sessionStorage.getItem("atlas-handoff-continuation")).toBe("1");
  });

  it("redirectAfterHandoff always seeds before navigate (acceptance)", () => {
    const paths: string[] = [];
    redirectAfterHandoff(7, (p) => paths.push(p));
    expect(sessionStorage.getItem("atlas-handoff-continuation")).toBe("1");
    expect(sessionStorage.getItem("atlas-opening-message-project-id")).toBe("7");
    expect(paths[0]).toContain("/project/7?");
    expect(paths[0]).toContain("source=home-handoff");
  });

  it("navigateAfterAskAtlasHandoff seeds and prefers /workspace when conversation id known", () => {
    const paths: string[] = [];
    navigateAfterAskAtlasHandoff(9, (p) => paths.push(p), {
      conversationId: "conv-abc",
      source: "home-handoff",
    });
    expect(sessionStorage.getItem("atlas-handoff-continuation")).toBe("1");
    expect(paths[0]).toContain("/workspace/conv-abc?");
    expect(paths[0]).toContain("from=home");
    expect(paths[0]).toContain("source=home-handoff");
  });

  it("navigateAfterAskAtlasHandoff falls back to /project with from=home", () => {
    const paths: string[] = [];
    navigateAfterAskAtlasHandoff(3, (p) => paths.push(p));
    expect(sessionStorage.getItem("atlas-handoff-continuation")).toBe("1");
    expect(paths[0]).toBe("/project/3?from=home&source=home-handoff");
  });
});

/**
 * INT-11 acceptance:
 * Multi-turn Ask Atlas → Crystallize/Commit → Workspace receives that transcript,
 * never an empty ambient nexusChat snapshot.
 */
describe("INT-11 selectHandoffMessages", () => {
  it("prefers Ask Atlas messages when Ask Atlas is the live surface", () => {
    const ask = [{ role: "user", content: "live ask atlas" }];
    const ambient: typeof ask = [];
    expect(
      selectHandoffMessages({
        preferAskAtlas: true,
        askAtlasMessages: ask,
        ambientMessages: ambient,
      }),
    ).toEqual(ask);
  });

  it("does not hand off an empty ambient store while Ask Atlas has the thread", () => {
    const ask = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const ambient: typeof ask = []; // cleared on Ask Atlas open
    const selected = selectHandoffMessages({
      preferAskAtlas: true,
      askAtlasMessages: ask,
      ambientMessages: ambient,
    });
    expect(selected.length).toBe(2);
    expect(selected[0].content).toBe("hello");
  });

  it("uses ambient messages when Ask Atlas is not preferred and ambient has content", () => {
    const ask: Array<{ role: string; content: string }> = [];
    const ambient = [{ role: "user", content: "ambient only" }];
    expect(
      selectHandoffMessages({
        preferAskAtlas: false,
        askAtlasMessages: ask,
        ambientMessages: ambient,
      }),
    ).toEqual(ambient);
  });
});
