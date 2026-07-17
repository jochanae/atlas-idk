import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNexusChatStream } from "@/hooks/useNexusChatStream";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function findNexusCall(fetchSpy: ReturnType<typeof vi.spyOn>) {
  return fetchSpy.mock.calls.find(([url]) => String(url).includes("/api/nexus/chat"));
}

describe("useNexusChatStream — attachments regression", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ content: "ok" }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs /api/nexus/chat with attachments[] and legacy image fields", async () => {
    const { result } = renderHook(() => useNexusChatStream({
      focusProjectId: 123,
      conversationId: "conv-123",
      model: "gemini",
      mode: "audit",
    }));

    await act(async () => {
      await result.current.send({
        text: "Look at these",
        attachments: [
          { base64: "AAA", mediaType: "image/png", name: "one.png" },
          { base64: "BBB", mediaType: "image/jpeg", name: "two.jpg" },
        ],
      });
    });

    const chatCall = findNexusCall(fetchSpy);
    expect(chatCall, "expected POST /api/nexus/chat").toBeTruthy();
    const init = chatCall![1] as RequestInit;
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      message: "Look at these",
      model: "gemini",
      mode: "audit",
      history: [],
      conversationId: "conv-123",
      focusProjectId: 123,
    });
    expect(Array.isArray(body.attachments)).toBe(true);
    expect(body.attachments).toHaveLength(2);
    expect(body.attachments[0]).toMatchObject({ base64: "AAA", mediaType: "image/png" });
    expect(body.attachments[1]).toMatchObject({ base64: "BBB", mediaType: "image/jpeg" });
    // Legacy first-image fields (imageBase64 / imageMimeType — not imageData).
    expect(body.imageBase64).toBe("AAA");
    expect(body.imageMimeType).toBe("image/png");
  });

  it("converts legacy imageBase64 into attachments[]", async () => {
    const { result } = renderHook(() => useNexusChatStream({}));

    await act(async () => {
      await result.current.send({
        text: "single legacy image",
        imageBase64: "ZZZ",
        imageMimeType: "image/png",
      });
    });

    const chatCall = findNexusCall(fetchSpy);
    const body = JSON.parse(String((chatCall![1] as RequestInit).body));
    expect(body.attachments).toEqual([
      expect.objectContaining({ base64: "ZZZ", mediaType: "image/png" }),
    ]);
    expect(body.imageBase64).toBe("ZZZ");
  });

  it("includes PDF document attachments (does not filter them out)", async () => {
    const { result } = renderHook(() => useNexusChatStream({}));

    await act(async () => {
      await result.current.send({
        text: "mixed",
        attachments: [
          { base64: "IMG", mediaType: "image/png" },
          { base64: "PDF", mediaType: "application/pdf", name: "doc.pdf" },
        ],
      });
    });

    const chatCall = findNexusCall(fetchSpy);
    const body = JSON.parse(String((chatCall![1] as RequestInit).body));
    expect(body.attachments).toHaveLength(2);
    expect(body.attachments.map((a: { mediaType: string }) => a.mediaType)).toEqual([
      "image/png",
      "application/pdf",
    ]);
  });

  it("allows attachment-only sends to reach /api/nexus/chat", async () => {
    const { result } = renderHook(() => useNexusChatStream({}));

    await act(async () => {
      await result.current.send({
        text: "",
        attachments: [
          { base64: "AAA", mediaType: "image/png", name: "only.png" },
        ],
      });
    });

    const chatCall = findNexusCall(fetchSpy);
    expect(chatCall, "expected POST /api/nexus/chat for attachment-only send").toBeTruthy();
    const body = JSON.parse(String((chatCall![1] as RequestInit).body));
    expect(body.message).toBe("(file attached)");
    expect(body.attachments).toEqual([
      expect.objectContaining({ base64: "AAA", mediaType: "image/png", name: "only.png" }),
    ]);
  });
});
