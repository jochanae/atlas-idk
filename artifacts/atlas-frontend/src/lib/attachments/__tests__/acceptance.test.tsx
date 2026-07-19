/**
 * Attachment system acceptance tests.
 *
 * Covers the shared support matrix, staging/upload/retry/send gate, and the
 * reference composer used identically for Ask Atlas and Workspace.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  ATTACHMENT_SUPPORT_MATRIX,
  resolveSupport,
} from "@/lib/attachments/supportMatrix";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_MESSAGE_BYTES,
  shouldIncludeAttachmentsOnSend,
} from "@/lib/attachments/types";
import { createMockAdapter } from "@/lib/attachments/adapter";
import { useStagedAttachments } from "@/hooks/useStagedAttachments";
import { AttachmentComposer } from "@/components/attachments/AttachmentComposer";

function makeFile(name: string, type: string, size = 1024): File {
  const f = new File([new Uint8Array(Math.min(size, 64))], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

afterEach(() => {
  cleanup();
});

describe("support matrix (explicit contract)", () => {
  it("lists required model_use types", () => {
    const model = ATTACHMENT_SUPPORT_MATRIX.filter(
      (e) => e.capability === "model_use",
    ).map((e) => e.id);
    expect(model).toEqual(
      expect.arrayContaining(["png", "jpeg", "webp", "pdf", "txt", "markdown"]),
    );
  });

  it("lists required storage_only types", () => {
    const storage = ATTACHMENT_SUPPORT_MATRIX.filter(
      (e) => e.capability === "storage_only",
    ).map((e) => e.id);
    expect(storage).toEqual(
      expect.arrayContaining(["docx", "pptx", "xlsx", "csv", "zip"]),
    );
  });

  it("never claims model understanding for storage_only", () => {
    for (const entry of ATTACHMENT_SUPPORT_MATRIX) {
      if (entry.capability === "storage_only") {
        expect(entry.statusLabel.toLowerCase()).toContain("can't read");
        expect(entry.statusLabel.toLowerCase()).not.toContain("understood");
      }
    }
  });

  it("resolves extensions and mimes consistently", () => {
    expect(resolveSupport("image/png", "a.png").capability).toBe("model_use");
    expect(resolveSupport("", "notes.md").capability).toBe("model_use");
    expect(
      resolveSupport(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "deck.pptx",
      ).capability,
    ).toBe("storage_only");
    expect(resolveSupport("application/zip", "src.zip").capability).toBe(
      "storage_only",
    );
    expect(resolveSupport("application/x-msdownload", "evil.exe").allowed).toBe(
      false,
    );
  });

  it("defines shared limits in one place", () => {
    expect(ATTACHMENT_MAX_COUNT).toBe(10);
    expect(ATTACHMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(ATTACHMENT_MAX_MESSAGE_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe("send gate (identical across surfaces)", () => {
  it("allows image-only and text+files; rejects empty", () => {
    expect(
      shouldIncludeAttachmentsOnSend({ text: "", attachmentCount: 1 }),
    ).toEqual({ ok: true });
    expect(
      shouldIncludeAttachmentsOnSend({ text: "hi", attachmentCount: 2 }),
    ).toEqual({ ok: true });
    expect(
      shouldIncludeAttachmentsOnSend({ text: "   ", attachmentCount: 0 }),
    ).toEqual({ ok: false, reason: "empty" });
  });
});

describe("useStagedAttachments — upload, limits, retry", () => {
  it("uploads mixed types and labels storage_only", async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() =>
      useStagedAttachments({ adapter, autoUpload: true }),
    );

    await act(async () => {
      result.current.addFiles([
        makeFile("shot.png", "image/png"),
        makeFile("deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        makeFile("notes.md", "text/markdown"),
      ]);
    });

    await waitFor(() => {
      expect(result.current.readyFiles).toHaveLength(3);
      expect(result.current.isUploading).toBe(false);
    });

    const pptx = result.current.files.find((f) => f.name === "deck.pptx")!;
    expect(pptx.capability).toBe("storage_only");
    expect(pptx.processingStatus).toBe("unsupported");
    expect(pptx.attachmentId).toBeTruthy();
    expect(pptx.statusLabel).toMatch(/can't read/i);
  });

  it("blocks unsupported types before send", async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() =>
      useStagedAttachments({ adapter }),
    );

    await act(async () => {
      result.current.addFiles([makeFile("virus.exe", "application/x-msdownload")]);
    });

    expect(result.current.blockedFiles).toHaveLength(1);
    expect(result.current.readyFiles).toHaveLength(0);
    expect(result.current.blockedFiles[0]!.error?.code).toBe("UNSUPPORTED_TYPE");
  });

  it("enforces per-file and count limits", async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() =>
      useStagedAttachments({ adapter, maxCount: 2, autoUpload: false }),
    );

    await act(async () => {
      result.current.addFiles([
        makeFile("a.png", "image/png", ATTACHMENT_MAX_BYTES + 1),
        makeFile("b.png", "image/png"),
        makeFile("c.png", "image/png"),
        makeFile("d.png", "image/png"),
      ]);
    });

    expect(result.current.files.some((f) => f.error?.code === "TOO_LARGE")).toBe(
      true,
    );
    expect(result.current.files.some((f) => f.error?.code === "MAX_COUNT")).toBe(
      true,
    );
  });

  it("retries failed uploads without duplicating successful ones", async () => {
    let failOnce = true;
    const adapter = createMockAdapter({
      failUpload: (file) => {
        if (file.name === "bad.png" && failOnce) {
          failOnce = false;
          return true;
        }
        return false;
      },
    });
    const { result } = renderHook(() =>
      useStagedAttachments({ adapter }),
    );

    await act(async () => {
      result.current.addFiles([
        makeFile("good.png", "image/png"),
        makeFile("bad.png", "image/png"),
      ]);
    });

    await waitFor(() => {
      expect(result.current.readyFiles.some((f) => f.name === "good.png")).toBe(
        true,
      );
      expect(result.current.failedFiles.some((f) => f.name === "bad.png")).toBe(
        true,
      );
    });

    const goodId = result.current.readyFiles.find((f) => f.name === "good.png")!
      .attachmentId;

    await act(async () => {
      result.current.retryFailed();
    });

    await waitFor(() => {
      expect(result.current.readyFiles).toHaveLength(2);
      expect(result.current.failedFiles).toHaveLength(0);
    });

    const goodAfter = result.current.readyFiles.find(
      (f) => f.name === "good.png",
    )!;
    expect(goodAfter.attachmentId).toBe(goodId);
  });

  it("removes staged files", async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() =>
      useStagedAttachments({ adapter }),
    );
    await act(async () => {
      result.current.addFiles([makeFile("x.png", "image/png")]);
    });
    await waitFor(() => expect(result.current.readyFiles).toHaveLength(1));
    const id = result.current.readyFiles[0]!.id;
    await act(async () => {
      result.current.removeFile(id);
    });
    expect(result.current.files).toHaveLength(0);
  });
});

describe("AttachmentComposer — Ask Atlas & Workspace reference", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:mock",
      revokeObjectURL: () => {},
    });
  });

  it.each(["Ask Atlas (reference)", "Workspace (reference)"] as const)(
    "supports image-only send on %s",
    async (label) => {
      const adapter = createMockAdapter();
      const onSend = vi.fn().mockResolvedValue(undefined);
      render(
        <AttachmentComposer
          adapter={adapter}
          surfaceLabel={label}
          onSend={onSend}
        />,
      );

      const input = screen.getByTestId("file-input") as HTMLInputElement;
      const file = makeFile("solo.png", "image/png");
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      await waitFor(() => {
        expect(screen.getByTestId("send-button")).not.toBeDisabled();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("send-button"));
        fireEvent.click(screen.getByTestId("send-button"));
      });

      await waitFor(() => {
        expect(onSend).toHaveBeenCalledTimes(1);
      });
      const payload = onSend.mock.calls[0]![0];
      expect(payload.text).toBe("");
      expect(payload.attachmentIds).toHaveLength(1);
      expect(payload.capabilities).toEqual(["model_use"]);
    },
  );

  it("sends text plus mixed files with capability labels", async () => {
    const adapter = createMockAdapter();
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <AttachmentComposer
        adapter={adapter}
        surfaceLabel="Ask Atlas (reference)"
        onSend={onSend}
      />,
    );

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            makeFile("a.png", "image/png"),
            makeFile("b.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            makeFile("c.pdf", "application/pdf"),
          ],
        },
      });
    });

    fireEvent.change(screen.getByTestId("composer-text"), {
      target: { value: "Please review" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("send-button")).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-button"));
    });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const payload = onSend.mock.calls[0]![0];
    expect(payload.text).toBe("Please review");
    expect(payload.attachmentIds).toHaveLength(3);
    expect(payload.capabilities).toEqual(
      expect.arrayContaining(["model_use", "storage_only"]),
    );
  });

  it("renders support matrix on the reference surface", () => {
    const adapter = createMockAdapter();
    render(
      <AttachmentComposer
        adapter={adapter}
        onSend={async () => {}}
      />,
    );
    expect(screen.getByTestId("support-matrix")).toBeInTheDocument();
    expect(screen.getByText("PNG")).toBeInTheDocument();
    expect(screen.getByText("ZIP")).toBeInTheDocument();
  });
});
