import { describe, it, expect, afterEach } from "vitest";
import { isAttachmentContinuityV2Enabled } from "../attachmentGrounding";

describe("isAttachmentContinuityV2Enabled", () => {
  const prev = process.env.ATTACHMENT_CONTINUITY_V2;

  afterEach(() => {
    if (prev === undefined) delete process.env.ATTACHMENT_CONTINUITY_V2;
    else process.env.ATTACHMENT_CONTINUITY_V2 = prev;
  });

  it("is false when unset", () => {
    delete process.env.ATTACHMENT_CONTINUITY_V2;
    expect(isAttachmentContinuityV2Enabled()).toBe(false);
  });

  it("is true only for exact string 1", () => {
    process.env.ATTACHMENT_CONTINUITY_V2 = "1";
    expect(isAttachmentContinuityV2Enabled()).toBe(true);
    process.env.ATTACHMENT_CONTINUITY_V2 = "true";
    expect(isAttachmentContinuityV2Enabled()).toBe(false);
    process.env.ATTACHMENT_CONTINUITY_V2 = "0";
    expect(isAttachmentContinuityV2Enabled()).toBe(false);
  });
});
