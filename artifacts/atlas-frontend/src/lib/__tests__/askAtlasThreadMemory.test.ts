import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetAskAtlasThreadMemoryForTests,
  clearAskAtlasThreadMemory,
  getAskAtlasThreadMemory,
  mergeAskAtlasThread,
  setAskAtlasThreadMemory,
  shouldInjectAskAtlasWelcomeBack,
  isAskAtlasGenerationActive,
} from "../askAtlasThreadMemory";

describe("askAtlasThreadMemory", () => {
  beforeEach(() => {
    __resetAskAtlasThreadMemoryForTests();
  });

  it("survives soft remount via module memory", () => {
    setAskAtlasThreadMemory({
      conversationId: "conv-1",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "partial reply", streaming: true },
      ],
      isStreaming: true,
      activeRunId: "run-1",
    });
    expect(isAskAtlasGenerationActive()).toBe(true);
    const snap = getAskAtlasThreadMemory("conv-1");
    expect(snap?.messages).toHaveLength(2);
    expect(snap?.messages[1]?.content).toBe("partial reply");
    expect(snap?.isStreaming).toBe(true);
  });

  it("does not return memory for a different conversation", () => {
    setAskAtlasThreadMemory({
      conversationId: "conv-1",
      messages: [{ role: "user", content: "a" }],
    });
    expect(getAskAtlasThreadMemory("conv-2")).toBeNull();
  });

  it("merges memory assistant when server only has the user turn", () => {
    const merged = mergeAskAtlasThread(
      [{ role: "user", content: "follow up" }],
      {
        conversationId: "c",
        messages: [
          { role: "user", content: "follow up" },
          { role: "assistant", content: "Here is the streamed answer…", streaming: true },
        ],
        isStreaming: true,
        activeRunId: null,
        updatedAt: Date.now(),
      },
    );
    expect(merged.recoveredFromMemory).toBe(true);
    expect(merged.messages).toHaveLength(2);
    expect(merged.messages[1]?.role).toBe("assistant");
    expect(merged.messages[1]?.content).toContain("streamed answer");
    expect(merged.messages[1]?.streaming).toBeFalsy();
  });

  it("prefers longer memory assistant over shorter server assistant", () => {
    const merged = mergeAskAtlasThread(
      [
        { role: "user", content: "q" },
        { role: "assistant", content: "short" },
      ],
      {
        conversationId: "c",
        messages: [
          { role: "user", content: "q" },
          { role: "assistant", content: "short then much longer recovered body" },
        ],
        isStreaming: false,
        activeRunId: null,
        updatedAt: Date.now(),
      },
    );
    expect(merged.recoveredFromMemory).toBe(true);
    expect(merged.messages[1]?.content).toContain("much longer");
  });

  it("gates welcome-back when recovered or awaiting assistant", () => {
    expect(
      shouldInjectAskAtlasWelcomeBack({
        alreadyGreeted: false,
        recoveredFromMemory: true,
        awaitingServerAssistant: false,
        messages: [{ role: "assistant", content: "hi" }],
      }),
    ).toBe(false);

    expect(
      shouldInjectAskAtlasWelcomeBack({
        alreadyGreeted: false,
        recoveredFromMemory: false,
        awaitingServerAssistant: true,
        messages: [{ role: "user", content: "hi" }],
      }),
    ).toBe(false);

    expect(
      shouldInjectAskAtlasWelcomeBack({
        alreadyGreeted: false,
        recoveredFromMemory: false,
        awaitingServerAssistant: false,
        messages: [{ role: "assistant", content: "complete turn" }],
      }),
    ).toBe(true);
  });

  it("clears memory", () => {
    setAskAtlasThreadMemory({
      conversationId: "conv-1",
      messages: [{ role: "user", content: "x" }],
      isStreaming: true,
    });
    clearAskAtlasThreadMemory("conv-1");
    expect(getAskAtlasThreadMemory("conv-1")).toBeNull();
    expect(isAskAtlasGenerationActive()).toBe(false);
  });
});
