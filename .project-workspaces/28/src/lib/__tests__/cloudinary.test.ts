import { describe, it, expect } from "vitest";
import { cloudinaryUrl, slideThumbnailUrl, slideFullUrl, slideShareUrl } from "@/lib/cloudinary";

describe("cloudinaryUrl", () => {
  const baseUrl = "https://res.cloudinary.com/demo/image/upload/v123/test.png";

  it("adds auto format and quality by default", () => {
    const result = cloudinaryUrl(baseUrl);
    expect(result).toContain("/upload/f_auto,q_auto/");
  });

  it("adds width and crop transforms", () => {
    const result = cloudinaryUrl(baseUrl, { width: 800, crop: "fill" });
    expect(result).toContain("w_800");
    expect(result).toContain("c_fill");
  });

  it("returns non-Cloudinary URLs unchanged", () => {
    const supabaseUrl = "https://example.supabase.co/storage/v1/object/public/test.png";
    expect(cloudinaryUrl(supabaseUrl)).toBe(supabaseUrl);
  });
});

describe("presets", () => {
  const url = "https://res.cloudinary.com/demo/image/upload/v1/slide.png";

  it("slideThumbnailUrl uses 480px width", () => {
    expect(slideThumbnailUrl(url)).toContain("w_480");
  });

  it("slideFullUrl uses 1920px width", () => {
    expect(slideFullUrl(url)).toContain("w_1920");
  });

  it("slideShareUrl uses 1280px width", () => {
    expect(slideShareUrl(url)).toContain("w_1280");
  });
});
