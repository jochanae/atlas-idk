import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followScrollIfNearBottom } from "@/lib/textPacer";

describe("followScrollIfNearBottom", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeContainer(opts: {
    scrollTop: number;
    clientHeight: number;
    scrollHeight: number;
  }) {
    const el = {
      scrollTop: opts.scrollTop,
      clientHeight: opts.clientHeight,
      scrollHeight: opts.scrollHeight,
    } as HTMLElement;
    return el;
  }

  it("pins to the clamped bottom when near the end", () => {
    const el = makeContainer({ scrollTop: 880, clientHeight: 100, scrollHeight: 1000 });
    followScrollIfNearBottom(el, 160);
    expect(el.scrollTop).toBe(900);
  });

  it("leaves the reader alone when scrolled up", () => {
    const el = makeContainer({ scrollTop: 100, clientHeight: 100, scrollHeight: 1000 });
    followScrollIfNearBottom(el, 160);
    expect(el.scrollTop).toBe(100);
  });

  it("coalesces multiple calls in the same frame to one write", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    const el = makeContainer({ scrollTop: 880, clientHeight: 100, scrollHeight: 1000 });
    followScrollIfNearBottom(el, 160);
    el.scrollHeight = 1100;
    followScrollIfNearBottom(el, 160);
    expect(callbacks).toHaveLength(1);
    callbacks[0](0);
    expect(el.scrollTop).toBe(1000);
  });
});
