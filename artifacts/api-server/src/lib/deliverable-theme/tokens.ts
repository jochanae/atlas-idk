// Deliverable Design System — shared brand tokens (Phase 3B.1).
//
// This is the single source of visual truth for Atlas-generated deliverables
// (PPTX today; DOCX/PDF/HTML consume the same tokens in later phases).
// Renderers must read colors/fonts/spacing from here rather than hardcoding
// their own values, so every deliverable format converges on one identity.
//
// Values mirror the app's own obsidian/gold theme
// (artifacts/atlas-frontend/src/styles.css) so a generated deck/doc looks
// like it came from the same product as the Atlas UI itself.

export interface DeliverableTheme {
  name: string;
  colors: {
    background: string;
    surface: string;
    accent: string;
    accentDim: string;
    heading: string;
    body: string;
    bodyMuted: string;
    footer: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
}

export const ATLAS_DEFAULT_THEME: DeliverableTheme = {
  name: "Atlas Obsidian",
  colors: {
    background: "0B0A0F",
    surface: "16151B",
    accent: "E6C687",
    accentDim: "8A7B5C",
    heading: "F5EFE0",
    body: "E8E6EA",
    bodyMuted: "A8A6AD",
    footer: "8A7B5C",
  },
  fonts: {
    // Standard PowerPoint-safe fonts that read as "elegant serif" / "clean sans"
    // without depending on custom font embedding.
    heading: "Georgia",
    body: "Calibri",
  },
};

export function resolveDeliverableTheme(): DeliverableTheme {
  // Phase 3B.1: Atlas default only. Project-theme inference and explicit
  // user-style overrides land in 3B.2 — do not add branching logic here yet.
  return ATLAS_DEFAULT_THEME;
}
