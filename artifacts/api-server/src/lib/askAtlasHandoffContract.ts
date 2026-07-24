/**
 * Ask Joy → Workspace handoff contract helpers (Milestone 1 INT-35).
 *
 * Milestone 2.4 Phase D — subtractive: keep execution gates; delete
 * concierge / two-sentence / door-attendant ceremony (A–C already own arrival).
 *
 * Canonical UX (see .agents/memory/atlas-shaping-threshold.md):
 *   PROJECT_READY → CommitPill → user tap → client create via handleHandoff.
 *
 * Explicit create phrasing may force the create_project tool so Joy cannot
 * narrate creation without executing it.
 */

/** Surface-contract copy injected on Ask Joy BUILD turns (not Workspace). */
export const ASK_ATLAS_HANDOFF_SURFACE_CONTRACT = `--- SURFACE CONTRACT: ASK ATLAS — HANDOFF REQUIRED ---
You received a build-oriented request on Ask Joy — NOT inside a Workspace.

Do NOT:
- Emit FILE_EDIT_START, LINE_PATCH_START, or any code-writing block
- Emit BUILD_CONTRACT_START / BUILD_CONTRACT_END
- Call GITHUB_PUSH or mutate project files
- Begin an execution run or software build
- Claim a workspace/project was created, is being created, or is opening — unless a create_project tool result in THIS turn confirms success
- Emit NAVIGATE_TO or invent "/project/<id>" paths
- Use a focused project in context as the routing target for a new build

Do:
- Continue the work in natural prose (proportionate). No ceremony.
- Emit as the ABSOLUTE LAST LINE (nothing after it):
  PROJECT_READY:{"projectName":"<name inferred from the conversation>","reason":"<one sentence: what this is and why it matters>"}
- Prefer PROJECT_READY over create_project on exploratory handoff (user confirms via Open Workspace).
- If the user explicitly asks to open an existing project, emit OPEN_PROJECT:{"projectName":"<name>"} as the LAST LINE instead.

HARD RULE: You may describe and plan here. You may NEVER start building here. The Workspace owns execution.

EXCEPTION — DELIVERABLE GENERATION IS ALWAYS ALLOWED: If the user asks for a spreadsheet, document, product brief, presentation, PDF, diagram, or similar file — call generate_deliverable THIS TURN. Do NOT emit PROJECT_READY for deliverable-only requests. Do NOT say the file is "in Outputs" unless generate_deliverable returned ok:true.
--- END SURFACE CONTRACT ---`;

/**
 * Phrases that mean the user wants the workspace created now — not merely
 * shaped. Intentionally excludes bare "yes"/"ok"/"do it" without object context.
 */
export const EXPLICIT_CREATE_SIGNALS = [
  "let's build it",
  "lets build it",
  "let's build this",
  "lets build this",
  "create the workspace",
  "start the project",
  "create the project",
  "create a workspace",
  "move this into a project",
  "turn this into a project",
  "move this to a workspace",
  "create it",
  "please create",
  "build this project",
  "build a ",
  "build an ",
  "build me",
  "build the ",
  "create a ",
  "create an ",
  "create me",
  "make a ",
  "make an ",
  "make me",
] as const;

export function messageHasExplicitCreateSignal(message: string): boolean {
  const messageLC = message.toLowerCase();
  return EXPLICIT_CREATE_SIGNALS.some((s) => messageLC.includes(s));
}

/**
 * True when the user is asking for a file deliverable (xlsx/pptx/docx/pdf/…)
 * rather than ongoing project / workspace management.
 */
const DELIVERABLE_FILE_RE =
  /\b(?:spreadsheet|excel|xlsx|workbook|powerpoint|pptx|slide\s*deck|\bdeck\b|slides?\b|presentation|docx|word\s+doc(?:ument)?|\bpdf\b|mermaid|flowchart|sequence\s+diagram|architecture\s+diagram|\bdiagram\b|(?:pie|bar|line)\s+chart|\bchart\b|html-?app|interactive\s+(?:web\s+)?(?:app|tool|widget)|(?:product\s+)?brief|one-?pager|executive\s+summary|write-?up)\b/i;

const PROJECT_MANAGEMENT_RE =
  /\b(?:workspace|create\s+(?:the\s+)?project|start\s+(?:the\s+)?project|open\s+(?:the\s+)?(?:workspace|project)|move\s+this\s+(?:into|to)\s+a\s+(?:project|workspace)|turn\s+this\s+into\s+a\s+project|build\s+(?:this|the|an?|me)\s+(?:app|application|product|saas|platform))\b/i;

export function isDeliverableOnlyRequest(message: string): boolean {
  const text = (message ?? "").trim();
  if (!text) return false;
  if (!DELIVERABLE_FILE_RE.test(text)) return false;
  if (PROJECT_MANAGEMENT_RE.test(text)) return false;
  return true;
}

export type ForceCreateDecisionInput = {
  message: string;
  /** BUILD/DECIDE tool access (Ask Joy or Workspace). */
  allowToolAccess: boolean;
  /** Workspace surface + BUILD — file-mutation mode. */
  allowBuildSideEffects: boolean;
  intent: string;
  focusProjectId: number | null | undefined;
  surfaceContext: "workspace" | "ask-atlas" | "home" | string;
};

/**
 * When true, nexus forces the create_project tool so Joy cannot narrate
 * creation without executing it (INT-35).
 */
export function shouldForceCreateProject(input: ForceCreateDecisionInput): boolean {
  if (input.focusProjectId) return false;
  if (isDeliverableOnlyRequest(input.message)) return false;
  if (!messageHasExplicitCreateSignal(input.message)) return false;

  if (input.allowBuildSideEffects) return true;

  return (
    input.allowToolAccess &&
    input.intent === "BUILD" &&
    input.surfaceContext !== "workspace"
  );
}

/** Post-tool instruction: confirm real create; do not claim auto-navigation. */
export const CREATE_PROJECT_SUCCESS_INSTRUCTION = (
  projectName: string,
  projectId: number,
  repoNote: string,
): string =>
  `Project "${projectName}" created with id ${projectId}.${repoNote} Confirm in one short sentence that it was created and that Open Workspace is available. Then STOP. Do NOT write code or files. Do NOT claim the workspace is already open or that navigation already happened. Do NOT include NAVIGATE_TO.`;
