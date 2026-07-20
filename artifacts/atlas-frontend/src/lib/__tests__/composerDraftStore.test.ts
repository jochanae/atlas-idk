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

  it("keeps input and conversationId but does not hold File blobs in draft memory", () => {
    const file = new File(["x"], "shot.png", { type: "image/png" });
    setAskAtlasComposerDraft({ input: "hello", files: [file], conversationId: "c1" });
    const again = getAskAtlasComposerDraft();
    expect(again.input).toBe("hello");
    // File blobs live in useStagedAttachments soft memory — never draft IDB.
    expect(again.files).toEqual([]);
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

  it("hard reload restores typed input but not staged File blobs", async () => {
    const pptx = new File(["pptx-bytes"], "pitch.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    setAskAtlasComposerDraft({ input: "review slides", files: [pptx] });
    await __flushComposerDraftPersistForTests();

    // Simulate hard reload — wipe module memory, keep sessionStorage.
    __resetComposerDraftStoreForTests();
    expect(getAskAtlasComposerDraft().files).toHaveLength(0);

    const restored = await hydrateAskAtlasComposerDraft();
    expect(restored.input).toBe("review slides");
    expect(restored.files).toEqual([]);
  });

  it("never calls File.arrayBuffer when staging (IDB blob persist disabled)", async () => {
    const file = new File(["same-bytes"], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      lastModified: 1_700_000_000_000,
    });
    const originalArrayBuffer = file.arrayBuffer.bind(file);
    let arrayBufferCalls = 0;
    file.arrayBuffer = async () => {
      arrayBufferCalls += 1;
      return originalArrayBuffer();
    };

    setAskAtlasComposerDraft({ input: "v1", files: [file] });
    await __flushComposerDraftPersistForTests();
    expect(arrayBufferCalls).toBe(0);

    setAskAtlasComposerDraft({ input: "v2", files: [file] });
    await __flushComposerDraftPersistForTests();
    expect(arrayBufferCalls).toBe(0);
    expect(getAskAtlasComposerDraft().input).toBe("v2");
    expect(getAskAtlasComposerDraft().files).toEqual([]);
  });
});
