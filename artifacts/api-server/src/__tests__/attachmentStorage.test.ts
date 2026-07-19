import { afterEach, describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_MESSAGE_BYTES,
  buildAttachmentObjectName,
  resolveChatAttachmentsLocation,
  resolveStoredObject,
  sanitizeFilename,
} from "../lib/attachmentStorage";

describe("attachmentStorage", () => {
  const originalPrivateDir = process.env.PRIVATE_OBJECT_DIR;
  const originalChatBucket = process.env.CHAT_ATTACHMENTS_BUCKET;

  afterEach(() => {
    if (originalPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = originalPrivateDir;
    }
    if (originalChatBucket === undefined) {
      delete process.env.CHAT_ATTACHMENTS_BUCKET;
    } else {
      process.env.CHAT_ATTACHMENTS_BUCKET = originalChatBucket;
    }
  });

  it("exports shared attachment limits", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(ATTACHMENT_MAX_COUNT).toBe(10);
    expect(ATTACHMENT_MAX_MESSAGE_BYTES).toBe(50 * 1024 * 1024);
  });

  it("sanitizes filenames without dropping safe punctuation", () => {
    expect(sanitizeFilename("../weird/name @#$ (1).png")).toBe("name _ (1).png");
    expect(sanitizeFilename("   ")).toBe("file");
  });

  it("uses a dedicated chat attachment bucket when configured", () => {
    process.env.CHAT_ATTACHMENTS_BUCKET = "atlas-chat-files";
    delete process.env.PRIVATE_OBJECT_DIR;

    expect(resolveChatAttachmentsLocation()).toEqual({
      bucketName: "atlas-chat-files",
      prefix: "",
      storageBucket: "atlas-chat-files",
    });
    expect(buildAttachmentObjectName(7, "att-1", "mock.png")).toEqual({
      bucketName: "atlas-chat-files",
      objectName: "7/att-1/mock.png",
      storageBucket: "atlas-chat-files",
      storagePath: "7/att-1/mock.png",
    });
  });

  it("falls back to PRIVATE_OBJECT_DIR with logical storage bucket", () => {
    delete process.env.CHAT_ATTACHMENTS_BUCKET;
    process.env.PRIVATE_OBJECT_DIR = "/private-bucket/root";

    expect(resolveChatAttachmentsLocation()).toEqual({
      bucketName: "private-bucket",
      prefix: "root/chat-attachments",
      storageBucket: "chat-attachments",
    });
    expect(resolveStoredObject({
      storageBucket: "chat-attachments",
      storagePath: "7/att-1/file.txt",
    })).toEqual({
      bucketName: "private-bucket",
      objectName: "root/chat-attachments/7/att-1/file.txt",
    });
  });

  it("resolves legacy /objects storage paths used by inline persistence", () => {
    delete process.env.CHAT_ATTACHMENTS_BUCKET;
    process.env.PRIVATE_OBJECT_DIR = "/private-bucket/root";

    expect(resolveStoredObject({
      storageBucket: "private-bucket",
      storagePath: "/objects/uploads/abc",
    })).toEqual({
      bucketName: "private-bucket",
      objectName: "root/uploads/abc",
    });
  });
});
