/**
 * check-direct-callers.ts
 *
 * Reports newly introduced direct callers of protected conversation-layer
 * entry points. This script REPORTS only — it does not fail CI or alter any
 * deployment behavior.
 *
 * Protected entry points:
 *   - fetch("/api/chat")        — legacy builder route
 *   - fetch("/api/nexus/chat")  — canonical Nexus route (must only go through useNexusChatStream)
 *   - useChatStream(            — must only be instantiated in workspace.tsx
 *   - fileToBase64Safe          — canonical conversion; must only be in useAtlasConversation.submit()
 *                                 for conversational sends
 *
 * Architecture context:
 *   docs/architecture/runtime-map.md
 *   docs/architecture/conversation-ownership.md
 *   docs/architecture/attachment-ownership.md
 *   docs/architecture/agent-change-rules.md
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// ─── Known-callers allow-list ─────────────────────────────────────────────────
//
// Each entry is a file path (relative to repo root) that is expected to contain
// the pattern. Files not in this list that match the pattern will be reported.
//
// Update this list when a migration intentionally moves a call site.

const KNOWN_CALLERS: Record<string, string[]> = {
  // Direct fetch("/api/chat") — legacy builder route
  'fetch("/api/chat")': [
    "artifacts/atlas-frontend/src/components/home/ActiveRuns.tsx",
    "artifacts/atlas-frontend/src/components/workspace/FlowPanel.tsx",
    "artifacts/atlas-frontend/src/hooks/useChatStream.ts",         // endpoint param default
    "artifacts/atlas-frontend/src/hooks/__tests__/useChatStream.visibility.test.tsx",
  ],

  // Direct fetch("/api/nexus/chat") — must only go through useNexusChatStream
  'fetch("/api/nexus/chat")': [
    // No frontend file should contain this directly — it is the transport hook's private detail.
    // useNexusChatStream calls useAtlasStream which resolves to this URL; the string literal
    // may appear in test files.
    "artifacts/atlas-frontend/src/hooks/__tests__/useChatStream.visibility.test.tsx",
  ],

  // useChatStream( instantiation — must only be in workspace.tsx
  "useChatStream(": [
    "artifacts/atlas-frontend/src/pages/workspace.tsx",
    "artifacts/atlas-frontend/src/hooks/useChatStream.ts",           // function definition
    "artifacts/atlas-frontend/src/hooks/__tests__/useChatStream.visibility.test.tsx",
  ],

  // fileToBase64Safe — canonical conversion function
  "fileToBase64Safe": [
    "artifacts/atlas-frontend/src/hooks/useAtlasConversation.ts",   // CANONICAL: conversion loop
    "artifacts/atlas-frontend/src/lib/image-resize.ts",             // definition
    "artifacts/atlas-frontend/src/pages/home.tsx",                  // pre-navigation seed only (not a conversational send)
    "artifacts/atlas-frontend/src/components/workspace/FlowPanel.tsx", // LEGACY: flow image attachment
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPO_ROOT = join(new URL(import.meta.url).pathname, "..", "..", "..");

// Relative path of this script — excluded from its own scan so pattern strings
// inside KNOWN_CALLERS don't self-report as new callers.
const THIS_SCRIPT = join(REPO_ROOT, "scripts/src/check-direct-callers.ts");

function walkFiles(dir: string, results: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    // Skip common build/tool dirs and also .project-workspaces (task-agent sandbox
    // copies of the repo that should not be scanned as part of the main codebase).
    if (
      entry === "node_modules" ||
      entry === ".git" ||
      entry === "dist" ||
      entry === ".local" ||
      entry === ".project-workspaces"
    ) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walkFiles(full, results);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const allFiles = walkFiles(REPO_ROOT);
let newCallersFound = false;

console.log("=== Axiom direct-caller check (report mode — does not fail) ===\n");
console.log(`Scanned ${allFiles.length} source files from ${REPO_ROOT}\n`);

for (const [pattern, knownPaths] of Object.entries(KNOWN_CALLERS)) {
  const knownSet = new Set(knownPaths.map((p) => join(REPO_ROOT, p)));
  const violators: string[] = [];

  for (const file of allFiles) {
    if (file === THIS_SCRIPT) continue;
    let content: string;
    try { content = readFileSync(file, "utf8"); } catch { continue; }
    if (!content.includes(pattern)) continue;
    if (knownSet.has(file)) continue;
    violators.push(relative(REPO_ROOT, file));
  }

  if (violators.length > 0) {
    newCallersFound = true;
    console.log(`⚠️  NEW CALLER: "${pattern}"`);
    for (const v of violators) {
      console.log(`     ${v}`);
    }
    console.log(`   Known callers (expected): ${knownPaths.length}`);
    console.log(`   Action: verify this call is intentional and add to KNOWN_CALLERS if so.`);
    console.log(`   Docs:   docs/architecture/agent-change-rules.md\n`);
  } else {
    console.log(`✓  "${pattern}" — no new callers outside known set (${knownPaths.length} known)`);
  }
}

console.log("\n" + (newCallersFound
  ? "⚠️  New callers detected above. Review before merging."
  : "✓  All protected entry points within known callers. No action needed."));
