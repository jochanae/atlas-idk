import { describe, it, expect, afterEach } from "vitest";
import { isAttachmentContinuityV2Enabled } from "../attachmentGrounding";

describe("isAttachmentContinuityV2Enabled", () => {
  const prev = process.env.ATTACHMENT_CONTINUITY_V2;

  afterEach(() => {
    if (prev === undefined) delete process.env.ATTACHMENT_CONTINUITY_V2;
    else process.env.ATTACHMENT_CONTINUITY_V2 = prev;
  });

  it("defaults on when unset (INT-12 / G1-2)", () => {
    delete process.env.ATTACHMENT_CONTINUITY_V2;
    expect(isAttachmentContinuityV2Enabled()).toBe(true);
  });

  it("defaults on when empty string", () => {
    process.env.ATTACHMENT_CONTINUITY_V2 = "";
    expect(isAttachmentContinuityV2Enabled()).toBe(true);
  });

  it("stays on for explicit enable values", () => {
    process.env.ATTACHMENT_CONTINUITY_V2 = "1";
    expect(isAttachmentContinuityV2Enabled()).toBe(true);
    process.env.ATTACHMENT_CONTINUITY_V2 = "true";
    expect(isAttachmentContinuityV2Enabled()).toBe(true);
  });

  it("kill switch ATTACHMENT_CONTINUITY_V2=0 disables", () => {
    process.env.ATTACHMENT_CONTINUITY_V2 = "0";
    expect(isAttachmentContinuityV2Enabled()).toBe(false);
  });

  it("also disables for false/off (case-insensitive)", () => {
    process.env.ATTACHMENT_CONTINUITY_V2 = "false";
    expect(isAttachmentContinuityV2Enabled()).toBe(false);
    process.env.ATTACHMENT_CONTINUITY_V2 = "OFF";
    expect(isAttachmentContinuityV2Enabled()).toBe(false);
  });
});
