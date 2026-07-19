import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUT_STALL_TIMEOUT_MS,
  putWithProgress,
} from "../uploadService";

describe("putWithProgress", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves mock:// uploads immediately", async () => {
    const onProgress = vi.fn();
    await putWithProgress("mock://upload/x", new File(["a"], "a.txt"), undefined, {
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it("rejects when the caller aborts before send", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      putWithProgress(
        "https://storage.example/upload",
        new File(["a"], "a.txt"),
        undefined,
        { signal: controller.signal },
      ),
    ).rejects.toThrow(/aborted/i);
  });

  it("aborts on stall when XHR reports no progress", async () => {
    vi.useFakeTimers();

    class FakeXHR {
      static UNSENT = 0;
      readyState = 0;
      status = 0;
      timeout = 0;
      upload = { onprogress: null as ((evt: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      open = vi.fn();
      setRequestHeader = vi.fn();
      abort = vi.fn(() => {
        this.onabort?.();
      });
      send = vi.fn();
    }

    vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);

    const promise = putWithProgress(
      "https://storage.example/upload",
      new File(["a"], "a.txt"),
      undefined,
      { stallTimeoutMs: PUT_STALL_TIMEOUT_MS },
    );

    const rejection = expect(promise).rejects.toThrow(/stalled/i);
    await vi.advanceTimersByTimeAsync(PUT_STALL_TIMEOUT_MS + 10);
    await rejection;
  });
});
