// Draft generator renderers — Email / Slack / PR description / Changelog.
// These are plain-text/markdown "communication artifacts" grounded in
// conversation context. Atlas never sends or posts anything on the user's
// behalf — every draft is copy-ready text the user takes and pastes wherever
// they choose. Each draft type registers as its own Artifact Engine renderer
// (category "draft") so persistence/Ledger/download/reopen behavior is
// identical to every other deliverable.
import { z } from "zod";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { generateValidatedContentPlan } from "./contentPlan";

export interface DraftGenerationInput {
  context: string;
  title?: string;
}

const DraftContentPlanSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  summary: z.string().optional(),
});
type DraftContentPlan = z.infer<typeof DraftContentPlanSchema>;

export type DraftType = "draft_email" | "draft_slack" | "draft_pr" | "draft_changelog";

interface DraftDefinition {
  type: DraftType;
  label: string;
  promptInstructions: string;
}

const DRAFT_DEFINITIONS: DraftDefinition[] = [
  {
    type: "draft_email",
    label: "Email Draft",
    promptInstructions: `Draft a professional email summarizing the relevant update, decision, or ask from the conversation below.

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<a short descriptive draft title, e.g. 'Email to stakeholders — Sprint 4 recap'>",
  "body": "<the full email, including a 'Subject: ...' line, a greeting, body paragraphs, and a sign-off>",
  "summary": "<one sentence describing what this email is about>"
}

Rules:
- Ground the email only in what was actually discussed — do not invent recipients, dates, or facts not present in the context.
- Keep tone professional and concise. No placeholder brackets like "[Name]" unless the context gives no way to know who the audience is — in that case use a neutral greeting like "Hi team,".
- This is a DRAFT ONLY. Never claim the email has been sent.`,
  },
  {
    type: "draft_slack",
    label: "Slack Message Draft",
    promptInstructions: `Draft a Slack message summarizing the relevant update, decision, or ask from the conversation below.

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<a short descriptive draft title, e.g. 'Slack update — API migration status'>",
  "body": "<the full Slack message text, using Slack-style markdown (*bold*, bullet lines with '-', short paragraphs)>",
  "summary": "<one sentence describing what this message is about>"
}

Rules:
- Ground the message only in what was actually discussed — do not invent channels, people, or facts not present in the context.
- Keep it casual but clear, the way a real teammate would post an update. Short lines, no email-style greeting/sign-off.
- This is a DRAFT ONLY. Never claim the message has been posted.`,
  },
  {
    type: "draft_pr",
    label: "PR Description Draft",
    promptInstructions: `Draft a pull request description for the change discussed in the conversation below.

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<a short descriptive draft title, e.g. 'PR description — Add bundle renderer'>",
  "body": "<the full PR description in markdown, with sections like '## What & Why', '## Changes', '## Testing' as relevant>",
  "summary": "<one sentence describing what this PR does>"
}

Rules:
- Ground the description only in what was actually discussed — describe the actual change, not a generic template.
- Use markdown headers and bullet points, the way a real PR description reads on GitHub.
- This is a DRAFT ONLY. Never claim the PR has been opened.`,
  },
  {
    type: "draft_changelog",
    label: "Changelog Entry Draft",
    promptInstructions: `Draft a changelog entry summarizing the relevant change, feature, or fix discussed in the conversation below.

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<a short descriptive draft title, e.g. 'Changelog entry — Deliverable Bundles'>",
  "body": "<the full changelog entry in markdown, typically a dated header followed by concise bullet points of what changed>",
  "summary": "<one sentence describing what this changelog entry covers>"
}

Rules:
- Ground the entry only in what was actually discussed — do not invent version numbers or unrelated changes.
- Keep bullets terse and user-facing (what changed and why it matters), not internal implementation detail.
- This is a DRAFT ONLY. Never claim it has been published.`,
  },
];

function buildPrompt(def: DraftDefinition, input: DraftGenerationInput): string {
  return `You are a communications assistant helping a user prepare a draft. ${def.promptInstructions}

Conversation context:
${input.context}`;
}

for (const def of DRAFT_DEFINITIONS) {
  registerArtifactRenderer({
    type: def.type,
    category: "draft",
    async render(input: DraftGenerationInput): Promise<ArtifactRenderOutput> {
      const prompt = buildPrompt(def, input);
      const plan = await generateValidatedContentPlan<DraftContentPlan>(prompt, DraftContentPlanSchema, def.label);
      const title = input.title?.trim() || plan.title;

      const buffer = Buffer.from(plan.body, "utf-8");

      return {
        buffer,
        title,
        mimeType: "text/markdown",
        extension: "md",
        preview: {
          title,
          draftType: def.type,
          draftLabel: def.label,
          body: plan.body,
          summary: plan.summary ?? null,
          isDraft: true,
        },
        summary: plan.summary ?? `Drafted ${def.label.toLowerCase()}: "${title}".`,
      };
    },
  });
}
