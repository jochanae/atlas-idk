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

export { createSideEffects } from "./context";
export type { AgentToolContext, AgentFileEdit, AgentLinePatch, AgentToolSideEffects } from "./context";

export function buildAgentTools(ctx: AgentToolContext) {
  return {
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
  };
}
