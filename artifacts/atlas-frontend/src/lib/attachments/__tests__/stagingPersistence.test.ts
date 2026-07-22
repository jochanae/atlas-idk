import { describe, it, expect, beforeEach } from "vitest";
import {
  clearStagingAttachmentMeta,
  clearStagingAttachmentMetaForSurface,
  loadStagingAttachmentMeta,
  loadStagingAttachmentMetaForSurface,
  removeStagingAttachmentMeta,
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

  it("filters meta by surface", () => {
    upsertStagingAttachmentMeta({
      clientAttachmentId: "a1",
      attachmentId: "id-a",
      filename: "a.pptx",
      mimeType: "application/octet-stream",
      sizeBytes: 10,
      uploadStatus: "uploaded",
      conversationId: null,
      surface: "ask-atlas",
      updatedAt: 1,
    });
    upsertStagingAttachmentMeta({
      clientAttachmentId: "w1",
      attachmentId: "id-w",
      filename: "w.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20,
      uploadStatus: "uploaded",
      conversationId: null,
      surface: "workspace",
      updatedAt: 2,
    });
    expect(loadStagingAttachmentMetaForSurface("ask-atlas")).toHaveLength(1);
    expect(loadStagingAttachmentMetaForSurface("ask-atlas")[0]?.filename).toBe("a.pptx");
    expect(loadStagingAttachmentMetaForSurface("workspace")).toHaveLength(1);
  });

  it("removeStagingAttachmentMeta drops one client id", () => {
    upsertStagingAttachmentMeta({
      clientAttachmentId: "keep",
      attachmentId: "k",
      filename: "keep.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      uploadStatus: "uploaded",
      conversationId: null,
      surface: "ask-atlas",
      updatedAt: 1,
    });
    upsertStagingAttachmentMeta({
      clientAttachmentId: "drop",
      attachmentId: "d",
      filename: "drop.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      uploadStatus: "uploaded",
      conversationId: null,
      surface: "ask-atlas",
      updatedAt: 2,
    });
    removeStagingAttachmentMeta("drop");
    const loaded = loadStagingAttachmentMetaForSurface("ask-atlas");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.clientAttachmentId).toBe("keep");
  });

  it("clearStagingAttachmentMetaForSurface leaves other surfaces intact", () => {
    upsertStagingAttachmentMeta({
      clientAttachmentId: "a1",
      attachmentId: "id-a",
      filename: "a.pptx",
      mimeType: "application/octet-stream",
      sizeBytes: 10,
      uploadStatus: "uploaded",
      conversationId: null,
      surface: "ask-atlas",
      updatedAt: 1,
    });
    upsertStagingAttachmentMeta({
      clientAttachmentId: "w1",
      attachmentId: "id-w",
      filename: "w.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20,
      uploadStatus: "uploaded",
      conversationId: null,
      surface: "workspace",
      updatedAt: 2,
    });
    clearStagingAttachmentMetaForSurface("ask-atlas");
    expect(loadStagingAttachmentMetaForSurface("ask-atlas")).toHaveLength(0);
    expect(loadStagingAttachmentMetaForSurface("workspace")).toHaveLength(1);
  });
});
