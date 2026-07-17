import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  sanitizeFilename,
  buildAttachmentObjectName,
} from "../lib/attachmentStorage";

describe("attachmentStorage helpers", () => {
  it("enforces 20MB cap constant", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
  });

  it("sanitizes filenames", () => {
    expect(sanitizeFilename("../../evil name!!.png")).toBe("evil name_.png");
    expect(sanitizeFilename("")).toBe("file");
  });

  it("builds storage path as userId/attachmentId/filename", () => {
    const prev = process.env.CHAT_ATTACHMENTS_BUCKET;
    const prevPrivate = process.env.PRIVATE_OBJECT_DIR;
    process.env.CHAT_ATTACHMENTS_BUCKET = "chat-attachments";
    delete process.env.PRIVATE_OBJECT_DIR;
    try {
      const loc = buildAttachmentObjectName(7, "att-uuid", "Report Draft.pdf");
      expect(loc.storageBucket).toBe("chat-attachments");
      expect(loc.storagePath).toBe("7/att-uuid/Report Draft.pdf");
      expect(loc.objectName).toBe("7/att-uuid/Report Draft.pdf");
      expect(loc.bucketName).toBe("chat-attachments");
    } finally {
      if (prev === undefined) delete process.env.CHAT_ATTACHMENTS_BUCKET;
      else process.env.CHAT_ATTACHMENTS_BUCKET = prev;
      if (prevPrivate === undefined) delete process.env.PRIVATE_OBJECT_DIR;
      else process.env.PRIVATE_OBJECT_DIR = prevPrivate;
    }
  });
});
