import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetAskAtlasThreadMemoryForTests,
  clearAskAtlasThreadMemory,
  getAskAtlasThreadMemory,
  mergeAskAtlasThread,
  setAskAtlasThreadMemory,
  isAskAtlasGenerationActive,
  type AskAtlasMemoryMessage,
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

  it("regression: merge never introduces a synthetic 'Welcome back' assistant turn", () => {
    // Simulates cold resume: server has the completed thread, no local memory snapshot.
    const server: AskAtlasMemoryMessage[] = [
      { role: "user", content: "hey" },
      { role: "assistant", content: "Real reply from the server." },
    ];
    const merged = mergeAskAtlasThread(server, null);
    // Transcript must be preserved exactly — no aa-resume-* id, no "Welcome back" copy.
    expect(merged.messages).toEqual(server);
    for (const m of merged.messages) {
      expect(String(m.id ?? "")).not.toMatch(/^aa-resume-/);
      expect(m.content).not.toMatch(/Welcome back/i);
    }
    // Exported/serialized shape must also be free of the synthetic greeting.
    const exported = JSON.stringify(merged.messages);
    expect(exported).not.toMatch(/Welcome back/i);
    expect(exported).not.toMatch(/aa-resume-/);
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
