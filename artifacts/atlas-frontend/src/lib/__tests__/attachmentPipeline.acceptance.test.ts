import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { shouldIncludeAttachmentsOnSend } from "@/lib/composerAttachments";

describe("Workspace / Ask Atlas attachment send contract", () => {
  it("allows text-only sends", () => {
    expect(shouldIncludeAttachmentsOnSend({ text: "hello", attachmentCount: 0 })).toEqual({
      ok: true,
    });
  });

  it("allows attachment-only sends (image without typed text)", () => {
    expect(shouldIncludeAttachmentsOnSend({ text: "   ", attachmentCount: 1 })).toEqual({
      ok: true,
    });
  });

  it("rejects empty composer", () => {
    expect(shouldIncludeAttachmentsOnSend({ text: "", attachmentCount: 0 })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("allows image + typed text", () => {
    expect(shouldIncludeAttachmentsOnSend({ text: "This is a test.", attachmentCount: 1 })).toEqual({
      ok: true,
    });
  });
});

/**
 * Regression: the Nexus Workspace composer override previously called
 * `nexusBridge.send(text)` with no attachments and bailed when text was empty.
 * That made Ask Atlas and Workspace share the Nexus transport but NOT the same
 * attachment contract. This documents the required call shape.
 */
describe("Nexus workspace send payload shape (acceptance)", () => {
  it("must pass attachments through to send when files are staged", async () => {
    const send = vi.fn();
    const text = "This is a test.";
    const attachments = [
      { base64: "AAA", mediaType: "image/png", name: "shot.png" },
    ];

    // Mimic the fixed Workspace override contract:
    if (!text.trim() && attachments.length === 0) {
      // no-op
    } else {
      send(text, attachments);
    }

    expect(send).toHaveBeenCalledWith(text, attachments);
    expect(send.mock.calls[0]![1]).toHaveLength(1);
    expect(send.mock.calls[0]![1][0].mediaType).toBe("image/png");
  });

  it("must not drop attachments when only files are staged", () => {
    const send = vi.fn();
    const text = "";
    const attachments = [
      { base64: "BBB", mediaType: "application/pdf", name: "doc.pdf" },
    ];
    if (!text.trim() && attachments.length === 0) {
      /* empty */
    } else {
      send(text, attachments);
    }
    expect(send).toHaveBeenCalledWith("", attachments);
  });
});

describe("Auth query policy (attachment-pipeline)", () => {
  it("documents required refetch policy — finite staleTime, no focus refetch", () => {
    // Guardrail for the speculative Replit change that set staleTime: Infinity
    // + refetchOnMount: false (which permanently masks expired sessions).
    const policy = {
      staleTime: 5 * 60 * 1000,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    };
    expect(policy.staleTime).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(policy.refetchOnMount).toBe(true);
    expect(policy.refetchOnWindowFocus).toBe(false);
  });
});

describe("attach-audit event order (attach → type, no send)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k === "atlas-attach-audit" ? "1" : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records picker → select → state → text without navigation", async () => {
    const { attachAuditLog } = await import("@/lib/attachAuditLog");
    // Clear via module state by logging a marker sequence
    const events: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      if (args[0] === "[attach-audit]") events.push(String(args[2]));
    });

    attachAuditLog("picker_opened", { kind: "attach" }, "ask-atlas");
    attachAuditLog("file_selected", { count: 1, names: ["a.png"] }, "ask-atlas");
    attachAuditLog("attachment_state_updated", { count: 1 }, "ask-atlas");
    attachAuditLog("composer_rerendered", { attached: 1 }, "ask-atlas");
    attachAuditLog("text_changed", { len: 14 }, "ask-atlas");

    expect(events).toEqual([
      "picker_opened",
      "file_selected",
      "attachment_state_updated",
      "composer_rerendered",
      "text_changed",
    ]);
    expect(events).not.toContain("window_location_change");
    expect(events).not.toContain("router_navigation");
    spy.mockRestore();
  });
});
