import type { AgentToolContext } from "./context";
import { readFileTool } from "./read-file";
import { searchCodebaseTool } from "./search-codebase";
import { listDirTool } from "./list-dir";
import { gitDiffTool } from "./git-diff";
import { readLedgerTool } from "./read-ledger";
import { readDnaTool } from "./read-dna";
import { searchMemoryTool } from "./search-memory";
import { editFileTool } from "./edit-file";
import { linePatchTool } from "./line-patch";
import { writeLedgerEntryTool } from "./write-ledger-entry";
import { patchDnaTool } from "./patch-dna";
import { runTypecheckTool } from "./run-typecheck";
import { runTestsTool } from "./run-tests";
import { screenshotPreviewTool } from "./screenshot-preview";
import { finishTool } from "./finish";
import { proposePlanTool } from "./propose-plan";
import { revisePlanTool } from "./revise-plan";
import { commitPlanTool } from "./commit-plan";
import { tier1UpsertFieldTool } from "./tier1-upsert-field";
import { tier1MarkSkippedTool } from "./tier1-mark-skipped";

export { createSideEffects, createPlanState } from "./context";
export type { AgentToolContext, AgentFileEdit, AgentLinePatch, AgentToolSideEffects, AgentPlanState } from "./context";

export function buildAgentTools(ctx: AgentToolContext, options?: { includePlanTools?: boolean }) {
  const base = {
    read_file: readFileTool(ctx),
    search_codebase: searchCodebaseTool(ctx),
    list_dir: listDirTool(ctx),
    git_diff: gitDiffTool(ctx),
    read_ledger: readLedgerTool(ctx),
    read_dna: readDnaTool(ctx),
    search_memory: searchMemoryTool(ctx),
    edit_file: editFileTool(ctx),
    line_patch: linePatchTool(ctx),
    write_ledger_entry: writeLedgerEntryTool(ctx),
    patch_dna: patchDnaTool(ctx),
    run_typecheck: runTypecheckTool(ctx),
    run_tests: runTestsTool(ctx),
    screenshot_preview: screenshotPreviewTool(ctx),
    finish: finishTool(ctx),
    tier1_upsert_field: tier1UpsertFieldTool(ctx),
    tier1_mark_skipped: tier1MarkSkippedTool(ctx),
  };

  if (!options?.includePlanTools) {
    return base;
  }

  return {
    ...base,
    propose_plan: proposePlanTool(ctx),
    revise_plan: revisePlanTool(ctx),
    commit_plan: commitPlanTool(ctx),
  };
}
