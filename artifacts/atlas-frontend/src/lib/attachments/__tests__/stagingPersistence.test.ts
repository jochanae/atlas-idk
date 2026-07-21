import { describe, it, expect, beforeEach } from "vitest";
import {
  clearStagingAttachmentMeta,
  loadStagingAttachmentMeta,
  upsertStagingAttachmentMeta,
} from "../stagingPersistence";

describe("stagingPersistence (T4 hard-reload metadata)", () => {
  beforeEach(() => {
    clearStagingAttachmentMeta();
  });

  it("persists finalized attachment IDs without File blobs", () => {
    upsertStagingAttachmentMeta({
      clientAttachmentId: "client-1",
      attachmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      filename: "deck.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sizeBytes: 1234,
      uploadStatus: "uploaded",
      conversationId: "conv-1",
      surface: "ask-atlas",
      updatedAt: Date.now(),
    });
    const loaded = loadStagingAttachmentMeta();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.attachmentId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(loaded[0]?.filename).toBe("deck.pptx");
    expect(JSON.stringify(loaded)).not.toMatch(/blob:|arrayBuffer|"File"/);
  });

  it("updates the same clientAttachmentId in place", () => {
    upsertStagingAttachmentMeta({
      clientAttachmentId: "client-1",
      attachmentId: null,
      filename: "deck.pptx",
      mimeType: "application/octet-stream",
      sizeBytes: 1,
      uploadStatus: "pending_upload",
      conversationId: null,
      surface: "ask-atlas",
      updatedAt: 1,
    });
    upsertStagingAttachmentMeta({
      clientAttachmentId: "client-1",
      attachmentId: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
      filename: "deck.pptx",
      mimeType: "application/octet-stream",
      sizeBytes: 1,
      uploadStatus: "uploaded",
      conversationId: "conv-1",
      surface: "ask-atlas",
      updatedAt: 2,
    });
    expect(loadStagingAttachmentMeta()).toHaveLength(1);
    expect(loadStagingAttachmentMeta()[0]?.uploadStatus).toBe("uploaded");
  });
});
