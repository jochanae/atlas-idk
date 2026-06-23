import type { Json } from "@/integrations/supabase/types";

/* ─── Theme Types ─── */
export interface SlideTheme {
  id: string;
  name: string;
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  muted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  mode: "light" | "dark";
  backgroundGradient?: string;
  backgroundMusicUrl?: string;
}

/* ─── Preset Themes ─── */
export const PRESET_THEMES: SlideTheme[] = [
  {
    id: "midnight-gold",
    name: "Midnight Gold",
    background: "#0A1628",
    foreground: "#F0F0F0",
    primary: "#D4AF37",
    secondary: "#1A2744",
    muted: "#8899AA",
    accent: "#F5A623",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    mode: "dark",
    backgroundGradient: "linear-gradient(135deg, #0A1628 0%, #162040 50%, #1A2744 100%)",
  },
  {
    id: "clean-white",
    name: "Clean White",
    background: "#FFFFFF",
    foreground: "#1A1A2E",
    primary: "#2563EB",
    secondary: "#F1F5F9",
    muted: "#64748B",
    accent: "#3B82F6",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    mode: "light",
    backgroundGradient: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  },
  {
    id: "deep-navy",
    name: "Deep Navy",
    background: "#0B1121",
    foreground: "#E2E8F0",
    primary: "#60A5FA",
    secondary: "#1E293B",
    muted: "#94A3B8",
    accent: "#38BDF8",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    mode: "dark",
    backgroundGradient: "linear-gradient(160deg, #0B1121 0%, #0F172A 40%, #1E293B 100%)",
  },
  {
    id: "warm-coral",
    name: "Warm Coral",
    background: "#FFF5F5",
    foreground: "#1A1A2E",
    primary: "#E11D48",
    secondary: "#FFF1F2",
    muted: "#6B7280",
    accent: "#FB7185",
    headingFont: "DM Serif Display",
    bodyFont: "DM Sans",
    mode: "light",
    backgroundGradient: "linear-gradient(135deg, #FFF5F5 0%, #FFF1F2 50%, #FCE7F3 100%)",
  },
  {
    id: "ocean-dark",
    name: "Ocean",
    background: "#0A192F",
    foreground: "#CCD6F6",
    primary: "#64FFDA",
    secondary: "#112240",
    muted: "#8892B0",
    accent: "#64FFDA",
    headingFont: "Montserrat",
    bodyFont: "Open Sans",
    mode: "dark",
    backgroundGradient: "linear-gradient(135deg, #0A192F 0%, #0D2137 50%, #112240 100%)",
  },
  {
    id: "royal-purple",
    name: "Royal",
    background: "#1A0A2E",
    foreground: "#F0E6FF",
    primary: "#BB86FC",
    secondary: "#2D1B4E",
    muted: "#9E8EC0",
    accent: "#CF6FFF",
    headingFont: "Outfit",
    bodyFont: "Nunito Sans",
    mode: "dark",
    backgroundGradient: "linear-gradient(160deg, #1A0A2E 0%, #2D1B4E 60%, #3D2660 100%)",
  },
  {
    id: "forest-green",
    name: "Forest",
    background: "#0F1F1C",
    foreground: "#E8F5E9",
    primary: "#4CAF50",
    secondary: "#1B3B36",
    muted: "#81C784",
    accent: "#66BB6A",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    mode: "dark",
    backgroundGradient: "linear-gradient(135deg, #0F1F1C 0%, #1B3B36 50%, #1A3330 100%)",
  },
  {
    id: "warm-sunset",
    name: "Sunset",
    background: "#FFF8F0",
    foreground: "#2D1B0E",
    primary: "#E65100",
    secondary: "#FFF3E0",
    muted: "#8D6E63",
    accent: "#FF6D00",
    headingFont: "Bebas Neue",
    bodyFont: "Roboto",
    mode: "light",
    backgroundGradient: "linear-gradient(135deg, #FFF8F0 0%, #FFF3E0 50%, #FFECB3 100%)",
  },
  {
    id: "minimal-gray",
    name: "Minimal",
    background: "#FAFAFA",
    foreground: "#18181B",
    primary: "#18181B",
    secondary: "#F4F4F5",
    muted: "#71717A",
    accent: "#18181B",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    mode: "light",
    backgroundGradient: "linear-gradient(180deg, #FAFAFA 0%, #F4F4F5 100%)",
  },
  {
    id: "charcoal-amber",
    name: "Charcoal Amber",
    background: "#1C1917",
    foreground: "#FAFAF9",
    primary: "#F59E0B",
    secondary: "#292524",
    muted: "#A8A29E",
    accent: "#FBBF24",
    headingFont: "DM Serif Display",
    bodyFont: "DM Sans",
    mode: "dark",
    backgroundGradient: "linear-gradient(160deg, #1C1917 0%, #292524 60%, #1C1917 100%)",
  },
];

export const FONT_PAIRINGS = [
  { heading: "Space Grotesk", body: "Inter", label: "Modern Tech" },
  { heading: "Playfair Display", body: "Source Sans 3", label: "Editorial" },
  { heading: "Montserrat", body: "Open Sans", label: "Clean Pro" },
  { heading: "DM Serif Display", body: "DM Sans", label: "Elegant" },
  { heading: "Outfit", body: "Nunito Sans", label: "Friendly" },
  { heading: "Bebas Neue", body: "Roboto", label: "Bold Impact" },
];

export const DEFAULT_THEME = PRESET_THEMES[0];

/* ─── Transition Types ─── */
export type TransitionType = "none" | "fade" | "slide" | "zoom" | "flip" | "morph";

export const TRANSITIONS: { id: TransitionType; label: string; description?: string }[] = [
  { id: "none", label: "None", description: "No animation between slides" },
  { id: "fade", label: "Fade", description: "Smooth cross-fade between slides" },
  { id: "slide", label: "Slide", description: "Horizontal slide animation" },
  { id: "zoom", label: "Zoom", description: "Zoom in/out transition" },
  { id: "flip", label: "Flip", description: "3D card flip effect" },
  { id: "morph", label: "Morph", description: "Magic Move — matching elements animate between slides" },
];

/* ─── Helpers ─── */
export function parseTheme(theme: Json | null | undefined): SlideTheme {
  if (theme && typeof theme === "object" && !Array.isArray(theme)) {
    const t = theme as Record<string, unknown>;
    return {
      id: (t.id as string) || DEFAULT_THEME.id,
      name: (t.name as string) || DEFAULT_THEME.name,
      background: (t.background as string) || DEFAULT_THEME.background,
      foreground: (t.foreground as string) || DEFAULT_THEME.foreground,
      primary: (t.primary as string) || DEFAULT_THEME.primary,
      secondary: (t.secondary as string) || DEFAULT_THEME.secondary,
      muted: (t.muted as string) || DEFAULT_THEME.muted,
      accent: (t.accent as string) || DEFAULT_THEME.accent,
      headingFont: (t.headingFont as string) || DEFAULT_THEME.headingFont,
      bodyFont: (t.bodyFont as string) || DEFAULT_THEME.bodyFont,
      mode: (t.mode as "light" | "dark") || DEFAULT_THEME.mode,
      backgroundGradient: (t.backgroundGradient as string) || undefined,
      backgroundMusicUrl: (t.backgroundMusicUrl as string) || undefined,
    };
  }
  return DEFAULT_THEME;
}

export function themeToJson(theme: SlideTheme): Json {
  return theme as unknown as Json;
}

export function themeToCSS(theme: SlideTheme): React.CSSProperties {
  return {
    "--slide-bg": theme.background,
    "--slide-fg": theme.foreground,
    "--slide-primary": theme.primary,
    "--slide-secondary": theme.secondary,
    "--slide-muted": theme.muted,
    "--slide-accent": theme.accent,
    "--slide-heading-font": `'${theme.headingFont}', system-ui, sans-serif`,
    "--slide-body-font": `'${theme.bodyFont}', system-ui, sans-serif`,
    "--slide-bg-gradient": theme.backgroundGradient || theme.background,
  } as React.CSSProperties;
}
