/**
 * resolveItemDestination — Slice A shared item resolver.
 *
 * Single authority for mapping a project_artifacts row to a user-facing
 * destination. All gallery and library surfaces must call this instead of
 * performing their own type/extension checks.
 *
 * The function is pure: no side effects, no fetch, no event dispatch.
 * Callers are responsible for executing the returned destination.
 *
 * Execution contracts:
 *   "sandbox"  — fetch HTML from download endpoint, dispatch
 *                axiom:open-preview { source:"sandbox", content: html }
 *   "download" — window.open(.../artifacts/:id/download, "_blank")
 *   "viewer"   — dispatch axiom:open-artifact-viewer { id, type, projectId }
 *                or fall back to download for unsupported viewer types
 *   "none"     — no interactive action; do not render an action button
 */

import { classify, type ClassifyInput, type OutputKind } from "./outputsClassification";

export type ItemDestination = "sandbox" | "download" | "viewer" | "none";

export interface ItemResolution {
  destination: ItemDestination;
  available: boolean;
  unavailableReason?: string;
  autoRender: boolean;
  actionLabel: string;
  viewport?: "presentation" | "document" | "spreadsheet";
}

interface DestinationSpec {
  destination: ItemDestination;
  autoRender: boolean;
  actionLabel: string;
  viewport?: ItemResolution["viewport"];
}

const KIND_TO_DESTINATION: Record<OutputKind, DestinationSpec> = {
  "html-app":        { destination: "sandbox",  autoRender: true,  actionLabel: "Open in Draft" },
  "diagram":         { destination: "viewer",   autoRender: true,  actionLabel: "View Diagram" },
  "chart":           { destination: "viewer",   autoRender: true,  actionLabel: "View Chart" },
  "sketch":          { destination: "viewer",   autoRender: true,  actionLabel: "View Sketch" },
  "image":           { destination: "viewer",   autoRender: true,  actionLabel: "View Image" },
  "presentation":    { destination: "download", autoRender: false, actionLabel: "Download PPTX", viewport: "presentation" },
  "spreadsheet":     { destination: "download", autoRender: false, actionLabel: "Download XLSX", viewport: "spreadsheet" },
  "pdf":             { destination: "download", autoRender: false, actionLabel: "Download PDF" },
  "document":        { destination: "download", autoRender: false, actionLabel: "Download",      viewport: "document" },
  "react-component": { destination: "none",     autoRender: false, actionLabel: "" },
  "project-app":     { destination: "none",     autoRender: false, actionLabel: "" },
  "deployed-app":    { destination: "none",     autoRender: false, actionLabel: "" },
  "mobile-mockup":   { destination: "none",     autoRender: false, actionLabel: "" },
  "snapshot":        { destination: "none",     autoRender: false, actionLabel: "" },
  "other":           { destination: "none",     autoRender: false, actionLabel: "" },
};

const UNAVAILABLE_REASON: Partial<Record<OutputKind, string>> = {
  "react-component": "no-runnable-bundle",
  "project-app":     "no-runnable-bundle",
  "deployed-app":    "no-runnable-bundle",
  "mobile-mockup":   "no-runnable-bundle",
  "snapshot":        "excluded-by-classifier",
  "other":           "excluded-by-classifier",
};

export function resolveItemDestination(input: ClassifyInput): ItemResolution {
  const classification = classify(input);
  const spec = KIND_TO_DESTINATION[classification.kind];
  const available = spec.destination !== "none";
  return {
    destination: spec.destination,
    autoRender:  spec.autoRender,
    actionLabel: spec.actionLabel,
    available,
    ...(spec.viewport ? { viewport: spec.viewport } : {}),
    ...(!available
      ? { unavailableReason: UNAVAILABLE_REASON[classification.kind] ?? "excluded-by-classifier" }
      : {}),
  };
}
