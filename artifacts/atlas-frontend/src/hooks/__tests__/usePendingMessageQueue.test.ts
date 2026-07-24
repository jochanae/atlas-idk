import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePendingMessageQueue } from "../usePendingMessageQueue";

describe("usePendingMessageQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues while busy and auto-drains FIFO when idle", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    const abort = vi.fn();
    let canSend = false;
    let busy = true;

    const { result, rerender } = renderHook(() =>
      usePendingMessageQueue({ canSend, busy, submit, abort }),
    );

    act(() => {
      result.current.enqueue({ text: "first" });
      result.current.enqueue({ text: "second" });
    });
    expect(result.current.items).toHaveLength(2);
    expect(submit).not.toHaveBeenCalled();

    canSend = true;
    busy = false;
    rerender();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // One item per idle window — next waits for the following busy→idle edge.
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toMatchObject({ text: "first" });
    expect(result.current.items.map((i) => i.text)).toEqual(["second"]);

    // Simulate the turn finishing again.
    canSend = false;
    busy = true;
    rerender();
    canSend = true;
    busy = false;
    rerender();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(submit.mock.calls.map((c) => c[0].text)).toEqual(["first", "second"]);
    expect(result.current.items).toHaveLength(0);
  });

  it("reorders with moveUp / moveDown", () => {
    const { result } = renderHook(() =>
      usePendingMessageQueue({
        canSend: false,
        busy: true,
        submit: async () => ({ ok: true }),
        abort: () => {},
      }),
    );

    act(() => {
      result.current.enqueue({ text: "a" });
      result.current.enqueue({ text: "b" });
      result.current.enqueue({ text: "c" });
    });
    const mid = result.current.items[1]!.id;

    act(() => {
      result.current.moveUp(mid);
    });
    expect(result.current.items.map((i) => i.text)).toEqual(["b", "a", "c"]);

    act(() => {
      result.current.moveDown(result.current.items[0]!.id);
    });
    expect(result.current.items.map((i) => i.text)).toEqual(["a", "b", "c"]);
  });

  it("sendNow aborts and promotes the selected item", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    const abort = vi.fn();
    const { result } = renderHook(() =>
      usePendingMessageQueue({
        canSend: false,
        busy: true,
        submit,
        abort,
      }),
    );

    act(() => {
      result.current.enqueue({ text: "a" });
      result.current.enqueue({ text: "b" });
    });
    const second = result.current.items[1]!.id;

    act(() => {
      result.current.sendNow(second);
    });
    expect(abort).toHaveBeenCalledWith({ reason: "newer_request" });
    expect(result.current.items[0]?.text).toBe("b");

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ text: "b" }),
    );
  });
});
