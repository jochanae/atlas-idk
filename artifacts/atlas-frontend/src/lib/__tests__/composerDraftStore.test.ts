import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __flushComposerDraftPersistForTests,
  __resetComposerDraftStoreForTests,
  clearAskAtlasComposerDraft,
  getAskAtlasComposerDraft,
  hydrateAskAtlasComposerDraft,
  setAskAtlasComposerDraft,
} from "@/lib/composerDraftStore";

describe("composerDraftStore", () => {
  beforeEach(() => {
    clearAskAtlasComposerDraft();
    __resetComposerDraftStoreForTests();
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    clearAskAtlasComposerDraft();
    __resetComposerDraftStoreForTests();
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

  it("persists typed input to sessionStorage for hard reload survival", () => {
    setAskAtlasComposerDraft({ input: "about this deck" });
    expect(sessionStorage.getItem("atlas-ask-atlas-composer-input")).toBe("about this deck");
    __resetComposerDraftStoreForTests();
    // Module reset leaves sessionStorage; get should hydrate input.
    expect(getAskAtlasComposerDraft().input).toBe("about this deck");
  });

  it("hydrates staged PowerPoint bytes from IndexedDB after reload", async () => {
    const pptx = new File(["pptx-bytes"], "pitch.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    setAskAtlasComposerDraft({ input: "review slides", files: [pptx] });
    await __flushComposerDraftPersistForTests();

    // Simulate hard reload — wipe module memory, keep IDB + sessionStorage.
    __resetComposerDraftStoreForTests();
    expect(getAskAtlasComposerDraft().files).toHaveLength(0);

    const restored = await hydrateAskAtlasComposerDraft();
    expect(restored.input).toBe("review slides");
    expect(restored.files).toHaveLength(1);
    expect(restored.files[0]?.name).toBe("pitch.pptx");
    expect(await restored.files[0]!.text()).toBe("pptx-bytes");
  });
});
