import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useChatStream, type UseChatStreamOptions } from "@/hooks/useChatStream";

// Regression coverage for task-161 ("forced remount on tab focus/blur").
//
// This does NOT reproduce a full app remount (none was found triggered by
// document.visibilitychange in current code — see .local/task-161-trace.md).
// It locks in the one real visibility-driven side effect that exists today
// (the B2c "summarize on hide" effect in useChatStream.ts) so a future
// regression that turns that side effect into a state-clearing/remount-style
// reset is caught immediately.

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeOpts(): UseChatStreamOptions {
  return {
    sessions: [{ id: 42 } as any],
    sessionsLoading: false,
    createSession: { mutateAsync: async () => ({ id: 42 }) } as any,
    queryClient: {
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
      getQueryData: vi.fn(),
    } as any,
    getListSessionsQueryKey: (id: number) => ["sessions", id],
    mapPriorMessage: (m: any) => m,
    endpoint: "/api/chat",
    entries: [],
    fileContext: null,
    forgeContext: null,
    dbUrl: null,
    sendCtxRef: { current: { wsLens: "flow", wsModel: "multi", githubToken: null } } as any,
    setDetectedLens: vi.fn(),
    setScenarioBuffer: vi.fn(),
    setLeftTab: vi.fn(),
    setMobileTab: vi.fn(),
    setPendingResolvedNodeIds: vi.fn(),
    setAutoNameKey: vi.fn(),
    getGetProjectQueryKey: (id: number) => ["project", id],
    getListProjectsQueryKey: () => ["projects"],
    reportError: vi.fn(),
  };
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

describe("useChatStream — tab visibility regression (task-161)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ content: "ok" }),
    );
    setDocumentHidden(false);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    setDocumentHidden(false);
  });

  it("does NOT clear messages, sessionId, or pending state when the tab is hidden then shown again", async () => {
    const opts = makeOpts();
    const { result, rerender } = renderHook(() => useChatStream(1, opts), { wrapper });

    act(() => {
      result.current.setMessages([
        { role: "user", content: "hello" } as any,
        { role: "assistant", content: "hi there" } as any,
        { role: "user", content: "second" } as any,
        { role: "assistant", content: "second reply" } as any,
      ]);
      result.current.setSessionId(42);
    });
    rerender();

    const messagesBefore = result.current.messages;
    const sessionIdBefore = result.current.sessionId;

    // Simulate tab losing focus.
    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Simulate tab regaining focus.
    act(() => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current.messages).toBe(messagesBefore);
    expect(result.current.messages).toHaveLength(4);
    expect(result.current.sessionId).toBe(sessionIdBefore);
    expect(result.current.chatPending).toBe(false);
  });

  it("only fires the summarize-on-hide network call once per session, never a full reload/reset", async () => {
    const opts = makeOpts();
    const { result, rerender } = renderHook(() => useChatStream(1, opts), { wrapper });

    act(() => {
      result.current.setMessages([
        { role: "assistant", content: "a1" } as any,
        { role: "assistant", content: "a2" } as any,
      ]);
      result.current.setSessionId(42);
    });
    rerender();
    fetchSpy.mockClear();

    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const summarizeCalls = fetchSpy.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes("/summarize"),
    );
    expect(summarizeCalls.length).toBe(1);

    // Hiding again in the same session must not re-fire it or touch messages.
    act(() => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
      setDocumentHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const summarizeCallsAfter = fetchSpy.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes("/summarize"),
    );
    expect(summarizeCallsAfter.length).toBe(1);
    expect(result.current.messages).toHaveLength(2);
  });
});
