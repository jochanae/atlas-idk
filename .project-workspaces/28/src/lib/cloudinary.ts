/**
 * Cloudinary URL transform utility for PresentQ slide images.
 *
 * Builds optimised delivery URLs with on-the-fly transforms:
 *   - auto format (WebP / AVIF where supported)
 *   - auto quality
 *   - resize / crop
 *   - CDN-cached globally
 */

/** Build a Cloudinary delivery URL with optional transforms. */
export function cloudinaryUrl(
  publicIdOrUrl: string,
  options: {
    width?: number;
    height?: number;
    crop?: "fill" | "fit" | "limit" | "scale" | "thumb";
    quality?: "auto" | number;
    format?: "auto" | "webp" | "png" | "jpg";
    /** Additional raw transform string, e.g. "e_blur:200" */
    raw?: string;
  } = {}
): string {
  // If it's already a full Cloudinary URL, inject transforms
  if (publicIdOrUrl.startsWith("https://res.cloudinary.com/")) {
    return injectTransforms(publicIdOrUrl, options);
  }

  // If it's a non-Cloudinary URL (legacy Supabase storage), return as-is
  if (publicIdOrUrl.startsWith("http")) {
    return publicIdOrUrl;
  }

  // It's a bare public_id — shouldn't happen in normal flow but handle it
  return publicIdOrUrl;
}

function injectTransforms(
  url: string,
  opts: Parameters<typeof cloudinaryUrl>[1]
): string {
  const parts: string[] = [];

  if (opts?.format ?? true) parts.push(`f_${opts?.format ?? "auto"}`);
  if (opts?.quality ?? true) parts.push(`q_${opts?.quality ?? "auto"}`);
  if (opts?.width) parts.push(`w_${opts.width}`);
  if (opts?.height) parts.push(`h_${opts.height}`);
  if (opts?.crop) parts.push(`c_${opts.crop}`);
  if (opts?.raw) parts.push(opts.raw);

  if (parts.length === 0) return url;

  const transform = parts.join(",");

  // Insert transforms after /upload/
  return url.replace("/upload/", `/upload/${transform}/`);
}

/** Preset: slide thumbnail (480px wide, auto quality/format) */
export function slideThumbnailUrl(url: string): string {
  return cloudinaryUrl(url, { width: 480, crop: "limit" });
}

/** Preset: full slide (1920px, high quality) */
export function slideFullUrl(url: string): string {
  return cloudinaryUrl(url, { width: 1920, crop: "limit" });
}

/** Preset: shared/embedded slide (1280px, balanced) */
export function slideShareUrl(url: string): string {
  return cloudinaryUrl(url, { width: 1280, crop: "limit" });
}
