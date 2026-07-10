// Rasterizes vocabulary icons (see iconLibrary.ts) to PNG buffers so
// pptxgenjs (which has no native SVG support) can place them as images.
// Uses @resvg/resvg-js — a pure Rust/WASM SVG renderer with no system deps,
// so this works the same in every environment without a headless browser.
import { Resvg } from "@resvg/resvg-js";
import { buildIconSvg, type IconKey } from "./iconLibrary";

const pngCache = new Map<string, Buffer>();

/**
 * Renders an icon to a square PNG buffer at `sizePx`, tinted `colorHex`
 * (no leading '#'). Results are cached in-memory per (icon, color, size)
 * so a single deck generation only rasterizes each unique icon once.
 */
export function renderIconPng(icon: IconKey, colorHex: string, sizePx = 96): Buffer {
  const cacheKey = `${icon}:${colorHex}:${sizePx}`;
  const cached = pngCache.get(cacheKey);
  if (cached) return cached;

  const svg = buildIconSvg(icon, colorHex);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: sizePx } });
  const png = resvg.render().asPng();
  pngCache.set(cacheKey, png);
  return png;
}

/** Returns a `data:image/png;base64,...` string suitable for pptxgenjs's `data` image option. */
export function renderIconDataUri(icon: IconKey, colorHex: string, sizePx = 96): string {
  return `data:image/png;base64,${renderIconPng(icon, colorHex, sizePx).toString("base64")}`;
}
