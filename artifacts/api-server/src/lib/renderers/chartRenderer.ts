// Chart renderer — plug-in for the Artifact Engine.
// Extracts structured tabular data from conversation context via Claude, then
// renders a bar/line/pie chart as plain SVG (no canvas/native deps, no headless
// browser) so it bundles cleanly and previews inline in any browser.
import { z } from "zod";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { generateValidatedContentPlan } from "./contentPlan";
import { buildChartSvg, type ChartPlan } from "./svgChartBuilder";

export interface ChartGenerationInput {
  context: string;
  title?: string;
  chartType?: "bar" | "line" | "pie";
}

const ChartContentPlanSchema = z.object({
  title: z.string().min(1),
  chartType: z.enum(["bar", "line", "pie"]),
  labels: z.array(z.string()).min(1),
  datasets: z
    .array(
      z.object({
        label: z.string().min(1),
        values: z.array(z.number()),
      }),
    )
    .min(1),
  summary: z.string().optional(),
});
type ChartContentPlan = z.infer<typeof ChartContentPlanSchema>;

const CHART_CONTENT_PROMPT = `You are a data analyst extracting structured numeric data for a {CHART_TYPE} chart from the conversation context below.

Conversation context:
{CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<chart title>",
  "chartType": "{CHART_TYPE}",
  "labels": ["<category or x-axis label 1>", "..."],
  "datasets": [
    { "label": "<series name>", "values": [<number>, "..."] }
  ],
  "summary": "<one sentence describing what the chart shows>"
}

Rules:
- Use ONLY real numbers actually stated or clearly implied in the conversation — never invent figures.
- "labels" and each dataset's "values" array MUST be the same length.
- For a "pie" chart, output exactly ONE dataset (pie charts show one series split into slices, one value per label).
- For "bar" or "line" charts, one or more datasets is fine (multiple series compared across the same labels).
- Keep labels and series names short and concrete.`;

function buildPrompt(input: ChartGenerationInput): string {
  const chartType = input.chartType ?? "bar";
  return CHART_CONTENT_PROMPT.replace(/\{CHART_TYPE\}/g, chartType).replace("{CONTEXT}", input.context);
}

registerArtifactRenderer({
  type: "chart",
  category: "diagram",
  async render(input: ChartGenerationInput): Promise<ArtifactRenderOutput> {
    const prompt = buildPrompt(input);
    const plan = await generateValidatedContentPlan<ChartContentPlan>(prompt, ChartContentPlanSchema, "Chart renderer");
    if (input.title) plan.title = input.title;

    const chartPlan: ChartPlan = {
      title: plan.title,
      chartType: plan.chartType,
      labels: plan.labels,
      datasets: plan.chartType === "pie" ? plan.datasets.slice(0, 1) : plan.datasets,
    };

    const svg = buildChartSvg(chartPlan);
    const buffer = Buffer.from(svg, "utf-8");

    return {
      buffer,
      title: plan.title,
      mimeType: "image/svg+xml",
      extension: "svg",
      preview: {
        title: plan.title,
        chartType: plan.chartType,
        labels: plan.labels,
        datasets: chartPlan.datasets,
        svg,
        summary: plan.summary ?? null,
      },
      summary: plan.summary ?? `Generated ${plan.chartType} chart "${plan.title}".`,
    };
  },
});
