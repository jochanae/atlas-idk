/**
 * WhisperGate action-suggestion map — maps user phrases to inline verification actions.
 * Used by chat stream detectors and Joy inline action chips.
 */
import type { VerifyKind } from "./verification";

export type WhisperGateAction = {
  kind: VerifyKind;
  label: string;
  token: string;
};

const PHRASE_ACTIONS: Array<{ patterns: RegExp[]; action: WhisperGateAction }> = [
  {
    patterns: [
      /\btype\s*check\b/i,
      /\btypecheck\b/i,
      /\bcheck\s+(for\s+)?type\s*errors?\b/i,
      /\bcheck\s+(for\s+)?ts\s*errors?\b/i,
    ],
    action: { kind: "typecheck", label: "Type Check", token: "VERIFY_RUN:typecheck" },
  },
  {
    patterns: [
      /\brun\s+tests?\b/i,
      /\btest\s+suite\b/i,
      /\bunit\s+tests?\b/i,
      /\bcheck\s+tests?\b/i,
    ],
    action: { kind: "test", label: "Tests", token: "VERIFY_RUN:test" },
  },
  {
    patterns: [
      /\brun\s+lint\b/i,
      /\blint\s+(the\s+)?(code|project)\b/i,
      /\bcheck\s+lint\b/i,
      /\beslint\b/i,
    ],
    action: { kind: "lint", label: "Lint", token: "VERIFY_RUN:lint" },
  },
  {
    patterns: [
      /\bverify\b/i,
      /\bcheck\s+for\s+errors?\b/i,
      /\bvalidate\s+(the\s+)?build\b/i,
      /\brun\s+verification\b/i,
    ],
    action: { kind: "typecheck", label: "Type Check", token: "VERIFY_RUN:typecheck" },
  },
  {
    patterns: [
      /\brun\s+build\b/i,
      /\bbuild\s+(the\s+)?project\b/i,
      /\bcompile\b/i,
    ],
    action: { kind: "build", label: "Build", token: "VERIFY_RUN:build" },
  },
];

export function matchWhisperGateAction(text: string): WhisperGateAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const { patterns, action } of PHRASE_ACTIONS) {
    if (patterns.some((p) => p.test(trimmed))) return action;
  }
  return null;
}

export function parseVerifyRunToken(content: string): VerifyKind | null {
  const match = content.match(/VERIFY_RUN\s*:?\s*(typecheck|test|lint|build)/i);
  if (!match) return null;
  return match[1].toLowerCase() as VerifyKind;
}

export const WHISPER_GATE_VERIFY_ACTIONS: WhisperGateAction[] = [
  { kind: "typecheck", label: "Type Check", token: "VERIFY_RUN:typecheck" },
  { kind: "test", label: "Tests", token: "VERIFY_RUN:test" },
  { kind: "lint", label: "Lint", token: "VERIFY_RUN:lint" },
  { kind: "build", label: "Build", token: "VERIFY_RUN:build" },
];
