import { afterEach, describe, expect, it } from "vitest";
import {
  clearAskAtlasComposerDraft,
  getAskAtlasComposerDraft,
  setAskAtlasComposerDraft,
} from "@/lib/composerDraftStore";

describe("composerDraftStore", () => {
  afterEach(() => {
    clearAskAtlasComposerDraft();
  });

  it("retains staged files across get/set (soft remount survival)", () => {
    const file = new File(["x"], "shot.png", { type: "image/png" });
    setAskAtlasComposerDraft({ input: "hello", files: [file], conversationId: "c1" });
    const again = getAskAtlasComposerDraft();
    expect(again.input).toBe("hello");
    expect(again.files).toHaveLength(1);
    expect(again.files[0]?.name).toBe("shot.png");
    expect(again.conversationId).toBe("c1");
  });

  it("clear empties the draft", () => {
    setAskAtlasComposerDraft({
      input: "x",
      files: [new File(["a"], "a.txt", { type: "text/plain" })],
    });
    clearAskAtlasComposerDraft();
    const d = getAskAtlasComposerDraft();
    expect(d.input).toBe("");
    expect(d.files).toEqual([]);
    expect(d.conversationId).toBeNull();
  });
});
