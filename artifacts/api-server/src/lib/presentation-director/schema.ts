// Presentation Director — shared slide-content schema (Phase 3B.3).
//
// This schema is renderer-agnostic on purpose: it describes *what* each slide
// is trying to say and *which layout* best communicates it, not how any
// particular format (PPTX/DOCX/PDF/HTML) draws it. Renderers consume a
// `SlidePlan` and are responsible only for painting each slide's layout with
// their own theme tokens.
import { z } from "zod";

const HeroSlide = z.object({
  layout: z.literal("hero"),
  eyebrow: z.string().optional(),
  heading: z.string().min(1),
  subheading: z.string().optional(),
});

const ProblemOpportunitySlide = z.object({
  layout: z.literal("problem_opportunity"),
  eyebrow: z.string().optional(),
  heading: z.string().min(1),
  points: z.array(z.string()).min(1).max(5),
});

const SolutionSlide = z.object({
  layout: z.literal("solution"),
  eyebrow: z.string().optional(),
  heading: z.string().min(1),
  description: z.string().optional(),
  points: z.array(z.string()).min(1).max(5),
});

const FeatureGridSlide = z.object({
  layout: z.literal("feature_grid"),
  heading: z.string().min(1),
  features: z
    .array(z.object({ title: z.string().min(1), description: z.string().min(1) }))
    .min(2)
    .max(4),
});

const TimelineSlide = z.object({
  layout: z.literal("timeline"),
  heading: z.string().min(1),
  milestones: z
    .array(z.object({ label: z.string().min(1), description: z.string().optional() }))
    .min(2)
    .max(6),
});

const KpiMetricsSlide = z.object({
  layout: z.literal("kpi_metrics"),
  heading: z.string().min(1),
  metrics: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(2)
    .max(4),
});

const ComparisonSlide = z.object({
  layout: z.literal("comparison"),
  heading: z.string().min(1),
  columns: z
    .array(z.object({ title: z.string().min(1), points: z.array(z.string()).min(1).max(5) }))
    .length(2),
});

const ProcessFlowSlide = z.object({
  layout: z.literal("process_flow"),
  heading: z.string().min(1),
  steps: z
    .array(z.object({ title: z.string().min(1), description: z.string().optional() }))
    .min(2)
    .max(5),
});

const ScreenshotShowcaseSlide = z.object({
  layout: z.literal("screenshot_showcase"),
  heading: z.string().min(1),
  caption: z.string().optional(),
  highlights: z.array(z.string()).min(1).max(4),
});

const QuoteSlide = z.object({
  layout: z.literal("quote"),
  quote: z.string().min(1),
  attribution: z.string().optional(),
});

const ClosingCtaSlide = z.object({
  layout: z.literal("closing_cta"),
  heading: z.string().min(1),
  subheading: z.string().optional(),
  actionItems: z.array(z.string()).min(1).max(6),
});

// Generic fallback for content that genuinely is just "heading + bullets" and
// doesn't fit a more specific layout — kept so the Director always has a safe
// choice rather than forcing content into the wrong shape.
const ContentBulletsSlide = z.object({
  layout: z.literal("content_bullets"),
  heading: z.string().min(1),
  bullets: z.array(z.string()).min(1).max(6),
});

export const SlideSchema = z.discriminatedUnion("layout", [
  HeroSlide,
  ProblemOpportunitySlide,
  SolutionSlide,
  FeatureGridSlide,
  TimelineSlide,
  KpiMetricsSlide,
  ComparisonSlide,
  ProcessFlowSlide,
  ScreenshotShowcaseSlide,
  QuoteSlide,
  ClosingCtaSlide,
  ContentBulletsSlide,
]);
export type Slide = z.infer<typeof SlideSchema>;
export type SlideLayout = Slide["layout"];

export const SlidePlanSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  purpose: z.string().min(1),
  slides: z.array(SlideSchema).min(3).max(12),
});
export type SlidePlan = z.infer<typeof SlidePlanSchema>;

export const LAYOUT_KEYS: SlideLayout[] = [
  "hero",
  "problem_opportunity",
  "solution",
  "feature_grid",
  "timeline",
  "kpi_metrics",
  "comparison",
  "process_flow",
  "screenshot_showcase",
  "quote",
  "closing_cta",
  "content_bullets",
];
