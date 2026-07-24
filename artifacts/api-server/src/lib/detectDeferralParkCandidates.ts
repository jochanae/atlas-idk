/**
 * Sync deferral detector for Parking Lot mid-band consent (80–94).
 * Runs before SSE `done` — no model call. High-precision patterns only.
 *
 * Contract: 80–94 → Joy asks "Park this?"; do not silent-park.
 */
import { PARK_ASK_MIN, PARK_AUTO_MIN } from "./parkingConfidence";

export type ParkAskCandidate = {
  title: string;
  summary: string;
  confidence: number;
  category: "Decision" | "Question" | "Idea" | "Risk" | "Research";
  suggestedType: "Decision" | "Question" | "Idea" | "Risk";
  source: "deferral-language" | "thinking-receipt";
};

type Pattern = {
  re: RegExp;
  confidence: number;
  category: ParkAskCandidate["category"];
  suggestedType: ParkAskCandidate["suggestedType"];
};

/** Explicit deferral language — bias toward precision over recall. */
const DEFERRAL_PATTERNS: Pattern[] = [
  { re: /\bwe(?:'ll| will)\s+decide\s+later\b/i, confidence: 90, category: "Decision", suggestedType: "Decision" },
  { re: /\bdecide\s+later\b/i, confidence: 88, category: "Decision", suggestedType: "Decision" },
  { re: /\bwe haven(?:'t|’t)\s+(?:answered|resolved|decided|figured)\b/i, confidence: 92, category: "Decision", suggestedType: "Decision" },
  { re: /\bstill\s+(?:an\s+)?open\s+question\b/i, confidence: 91, category: "Question", suggestedType: "Question" },
  { re: /\bopen\s+question(?:\s+is|\s*:)?\b/i, confidence: 88, category: "Question", suggestedType: "Question" },
  { re: /\bcome\s+back\s+to\s+this\b/i, confidence: 87, category: "Idea", suggestedType: "Idea" },
  { re: /\b(?:let(?:'s|’s)|we should)\s+(?:park|defer)\s+this\b/i, confidence: 93, category: "Decision", suggestedType: "Decision" },
  { re: /\bnot\s+ready\s+to\s+(?:commit|decide|lock)\b/i, confidence: 89, category: "Decision", suggestedType: "Decision" },
  { re: /\bto\s+be\s+decided\b|\b\bTBD\b/i, confidence: 86, category: "Decision", suggestedType: "Decision" },
  { re: /\bwe(?:'ll| will)\s+(?:revisit|return\s+to)\s+this\b/i, confidence: 88, category: "Idea", suggestedType: "Idea" },
  { re: /\bunresolved\b.{0,40}\b(?:question|decision|risk)\b/i, confidence: 85, category: "Question", suggestedType: "Question" },
  { re: /\brisk\s+(?:to\s+)?(?:revisit|park|defer)\b/i, confidence: 86, category: "Risk", suggestedType: "Risk" },
  { re: /\bneed\s+to\s+(?:research|investigate)\s+(?:this|that|whether|how|what)\b/i, confidence: 84, category: "Research", suggestedType: "Question" },
];

function clampAskBand(confidence: number): number {
  // Sync detector never auto-parks — clamp into ask band only.
  return Math.min(PARK_AUTO_MIN - 1, Math.max(PARK_ASK_MIN, Math.round(confidence)));
}

function sentenceAround(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(".", Math.max(0, index - 1)) + 1);
  const endCandidates = [".", "!", "?", "\n"].map((ch) => {
    const i = text.indexOf(ch, index + length);
    return i === -1 ? text.length : i;
  });
  const end = Math.min(...endCandidates);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function titleFromSentence(sentence: string): string {
  const cleaned = sentence
    .replace(/^(?:also|so|and|but|okay|ok|well)[,:\s]+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 80) return cleaned || "Unresolved item";
  return `${cleaned.slice(0, 77).trim()}…`;
}

/**
 * Detect mid-band park consent candidates from the turn text.
 * Returns at most 2 high-precision candidates.
 */
export function detectDeferralParkCandidates(opts: {
  userMessage: string;
  assistantResponse: string;
}): ParkAskCandidate[] {
  const blob = `${opts.userMessage ?? ""}\n${opts.assistantResponse ?? ""}`.trim();
  if (blob.length < 24) return [];

  const found: ParkAskCandidate[] = [];
  const seenTitles = new Set<string>();

  for (const pattern of DEFERRAL_PATTERNS) {
    const match = pattern.re.exec(blob);
    if (!match || match.index == null) continue;
    const sentence = sentenceAround(blob, match.index, match[0].length);
    if (sentence.length < 12) continue;
    const title = titleFromSentence(sentence);
    const key = title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    found.push({
      title,
      summary: sentence.slice(0, 500),
      confidence: clampAskBand(pattern.confidence),
      category: pattern.category,
      suggestedType: pattern.suggestedType,
      source: "deferral-language",
    });
    if (found.length >= 2) break;
  }

  return found;
}
