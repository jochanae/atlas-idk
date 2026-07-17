import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import {
  ATTACHMENT_MAX_BYTES,
  classifyKind,
  formatBytes,
  isExpiringSoon,
  type PersistedAttachment,
  type StagedAttachment,
} from "@/lib/attachments/types";
import { createMockAdapter } from "@/lib/attachments/adapter";
import {
  isAttachmentFlagOn,
  setAttachmentFlagOverride,
} from "@/lib/attachments/flags";
import { useMessageAttachments } from "@/hooks/useMessageAttachments";
import MessageAttachmentChip from "@/components/attachments/MessageAttachmentChip";
import AttachmentRow from "@/components/attachments/AttachmentRow";

const file = (name: string, type: string, size = 1024): File => {
  const f = new File([new Uint8Array(size)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const staged = (over: Partial<StagedAttachment> = {}): StagedAttachment => ({
  clientId: "c1",
  file: file("shot.png", "image/png"),
  kind: "image",
  uploadStatus: "uploaded",
  uploadProgress: 1,
  ...over,
});

const persisted = (over: Partial<PersistedAttachment> = {}): PersistedAttachment => ({
  attachmentId: "att_1",
  filename: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 12_345,
  kind: "pdf",
  availabilityStatus: "active",
  processingStatus: "understood",
  expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
  libraryItemId: null,
  ...over,
});

afterEach(() => {
  cleanup();
  setAttachmentFlagOverride("attachments.persistence", null);
});

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe("classifyKind", () => {
  it("classifies by mime", () => {
    expect(classifyKind("image/png", "a.png")).toBe("image");
    expect(classifyKind("application/pdf", "a.pdf")).toBe("pdf");
  });
  it("falls back to extension", () => {
    expect(classifyKind("", "notes.md")).toBe("text");
    expect(classifyKind("application/octet-stream", "server.ts")).toBe("code");
    expect(classifyKind("", "sheet.xlsx")).toBe("spreadsheet");
    expect(classifyKind("", "pitch.pptx")).toBe("doc");
    expect(
      classifyKind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pitch.pptx",
      ),
    ).toBe("doc");
  });
  it("returns 'other' for unknown", () => {
    expect(classifyKind("application/x-weird", "thing.zzz")).toBe("other");
  });
});

describe("isExpiringSoon", () => {
  it("true within 7 days", () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(isExpiringSoon(soon)).toBe(true);
  });
  it("false past 7 days", () => {
    const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isExpiringSoon(far)).toBe(false);
  });
  it("false when null / past", () => {
    expect(isExpiringSoon(null)).toBe(false);
    expect(isExpiringSoon(new Date(Date.now() - 1000).toISOString())).toBe(false);
  });
});

// ─── Flags ────────────────────────────────────────────────────────────────────

describe("attachment flags", () => {
  it("defaults off (legacy inline base64 path preserved)", () => {
    expect(isAttachmentFlagOn("attachments.persistence")).toBe(false);
  });
  it("localStorage override wins", () => {
    setAttachmentFlagOverride("attachments.persistence", true);
    expect(isAttachmentFlagOn("attachments.persistence")).toBe(true);
    setAttachmentFlagOverride("attachments.persistence", false);
    expect(isAttachmentFlagOn("attachments.persistence")).toBe(false);
  });
});

// ─── Mock adapter — full lifecycle ────────────────────────────────────────────

describe("mockAttachmentAdapter lifecycle", () => {
  it("upload → finalize → list for message", async () => {
    const a = createMockAdapter();
    const f = file("a.png", "image/png");
    const { attachmentId } = await a.requestUpload(f);
    const finalized = await a.finalizeUpload(attachmentId);
    expect(finalized.attachmentId).toBe(attachmentId);
    expect(finalized.processingStatus).toBe("understood");
    expect(finalized.expiresAt).toBeTruthy(); // server-owned
    a.__state.attach("msg_1", attachmentId);
    const list = await a.listForMessage("msg_1");
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe("a.png");
  });

  it("classifies docx as 'unsupported'; images/pdf as 'understood'", async () => {
    const a = createMockAdapter();
    const files = [
      file("shot.png", "image/png"),
      file("report.pdf", "application/pdf"),
      file(
        "spec.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
      file("Server.tsx", "text/plain"),
    ];
    const ids: string[] = [];
    for (const f of files) {
      const { attachmentId } = await a.requestUpload(f);
      ids.push(attachmentId);
      await a.finalizeUpload(attachmentId);
    }
    const statuses = ids.map((id) => a.__state.byId.get(id)!.processingStatus);
    expect(statuses).toEqual(["understood", "understood", "unsupported", "understood"]);
  });

  it("save-to-library nulls expiresAt; expired blocks open + use-again", async () => {
    const a = createMockAdapter();
    const { attachmentId } = await a.requestUpload(file("a.png", "image/png"));
    await a.finalizeUpload(attachmentId);
    const promoted = await a.saveToLibrary(attachmentId);
    expect(promoted.availabilityStatus).toBe("library");
    expect(promoted.expiresAt).toBeNull();
    expect(promoted.libraryItemId).toBeTruthy();

    const { attachmentId: id2 } = await a.requestUpload(file("b.pdf", "application/pdf"));
    await a.finalizeUpload(id2);
    a.__state.setAvailability(id2, "expired");
    await expect(a.getOpenUrl(id2)).rejects.toThrow(/expired/);
    await expect(a.useAgain(id2)).rejects.toThrow(/expired/);
  });

  it("upload failure surfaces to caller (composer will keep row + Retry)", async () => {
    const a = createMockAdapter({ failUpload: () => true });
    await expect(a.requestUpload(file("a.png", "image/png"))).rejects.toThrow();
  });
});

// ─── Chip UI states + menu contract ───────────────────────────────────────────

describe("MessageAttachmentChip menu contract", () => {
  it("staged: shows Remove only; no persisted actions", async () => {
    render(<MessageAttachmentChip variant={{ kind: "staged", attachment: staged() }} onAction={() => {}} />);
    fireEvent.click(screen.getByLabelText("Attachment actions"));
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Remove"]);
  });

  it("staged failed: Retry + Remove", async () => {
    render(
      <MessageAttachmentChip
        variant={{
          kind: "staged",
          attachment: staged({ uploadStatus: "failed", error: "Network down" }),
        }}
        onAction={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Attachment actions"));
    const items = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((el) => el.textContent);
    expect(items).toEqual(["Retry", "Remove"]);
  });

  it("persisted active: Open / Use again / Save to Library / Download", async () => {
    render(
      <MessageAttachmentChip
        variant={{ kind: "persisted", attachment: persisted() }}
        onAction={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Attachment actions"));
    const items = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((el) => el.textContent);
    expect(items).toEqual(["Open", "Use again", "Save to Library", "Download"]);
  });

  it("persisted library: no Save to Library option (already saved)", async () => {
    render(
      <MessageAttachmentChip
        variant={{
          kind: "persisted",
          attachment: persisted({
            availabilityStatus: "library",
            libraryItemId: "lib_1",
            expiresAt: null,
          }),
        }}
        onAction={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Attachment actions"));
    const items = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((el) => el.textContent);
    expect(items).toEqual(["Open", "Use again", "Download"]);
  });

  it("persisted expired: no menu, correct copy, no Remove", () => {
    render(
      <MessageAttachmentChip
        variant={{
          kind: "persisted",
          attachment: persisted({ availabilityStatus: "expired" }),
        }}
        onAction={() => {}}
      />,
    );
    expect(
      screen.getByText(/File expired · original file is no longer available/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Attachment actions")).toBeNull();
  });

  it("persisted expiring: 'Available until … · Save to Library to keep it'", () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <MessageAttachmentChip
        variant={{
          kind: "persisted",
          attachment: persisted({ availabilityStatus: "expiring", expiresAt: soon }),
        }}
        onAction={() => {}}
      />,
    );
    expect(
      screen.getByText(/Available until .+ · Save to Library to keep it/),
    ).toBeInTheDocument();
  });

  it("persisted unsupported: Open + Download only (no Use again)", async () => {
    render(
      <MessageAttachmentChip
        variant={{
          kind: "persisted",
          attachment: persisted({
            filename: "spec.docx",
            kind: "doc",
            processingStatus: "unsupported",
          }),
        }}
        onAction={() => {}}
      />,
    );
    expect(
      screen.getByText(/Stored — Atlas can't read this file type yet/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Attachment actions"));
    const items = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((el) => el.textContent);
    expect(items).toEqual(["Open", "Download"]);
  });
});

// ─── AttachmentRow wiring ─────────────────────────────────────────────────────

describe("AttachmentRow", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<AttachmentRow kind="staged" items={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it("emits remove for staged, save-to-library for persisted", async () => {
    const removed: string[] = [];
    const promoted: string[] = [];
    const { rerender } = render(
      <AttachmentRow
        kind="staged"
        items={[staged({ clientId: "sX" })]}
        onRemove={(id) => removed.push(id)}
      />,
    );
    fireEvent.click(screen.getByLabelText("Attachment actions"));
    fireEvent.mouseDown(await screen.findByRole("menuitem", { name: /Remove/ }));
    expect(removed).toEqual(["sX"]);

    rerender(
      <AttachmentRow
        kind="persisted"
        items={[persisted({ attachmentId: "att_9" })]}
        onSaveToLibrary={(id) => promoted.push(id)}
      />,
    );
    fireEvent.click(screen.getByLabelText("Attachment actions"));
    fireEvent.mouseDown(
      await screen.findByRole("menuitem", { name: /Save to Library/ }),
    );
    expect(promoted).toEqual(["att_9"]);
  });
});

// ─── useMessageAttachments — reload restoration + flag gate ───────────────────

describe("useMessageAttachments", () => {
  beforeEach(() => {
    setAttachmentFlagOverride("attachments.persistence", true);
  });

  it("restores chips from adapter after 'reload' (remount)", async () => {
    const adapter = createMockAdapter();
    const { attachmentId } = await adapter.requestUpload(file("a.png", "image/png"));
    await adapter.finalizeUpload(attachmentId);
    adapter.__state.attach("msg_persist_1", attachmentId);

    const { result } = renderHook(() =>
      useMessageAttachments("msg_persist_1", { adapter }),
    );
    await waitFor(() => expect(result.current.attachments).toHaveLength(1));
    expect(result.current.attachments[0].filename).toBe("a.png");

    // Simulate reload = fresh hook mount against the same server state.
    const { result: result2 } = renderHook(() =>
      useMessageAttachments("msg_persist_1", { adapter }),
    );
    await waitFor(() => expect(result2.current.attachments).toHaveLength(1));
  });

  it("returns [] when persistence flag is off (legacy path preserved)", async () => {
    setAttachmentFlagOverride("attachments.persistence", false);
    const adapter = createMockAdapter();
    const { attachmentId } = await adapter.requestUpload(file("a.png", "image/png"));
    await adapter.finalizeUpload(attachmentId);
    adapter.__state.attach("msg_flag_off", attachmentId);

    const { result } = renderHook(() =>
      useMessageAttachments("msg_flag_off", { adapter }),
    );
    // brief tick so the effect runs
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.attachments).toEqual([]);
  });

  it("returns [] and does not throw when messageId is null", async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useMessageAttachments(null, { adapter }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.attachments).toEqual([]);
  });
});

// ─── Size/format sanity (staged validation lives in composer; keep unit here) ─

describe("staged-file validation constants", () => {
  it("20MB cap matches composer", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
  });
  it("formatBytes is human-readable", () => {
    expect(formatBytes(1024)).toMatch(/KB$/);
    expect(formatBytes(1_500_000)).toMatch(/MB$/);
  });
});
