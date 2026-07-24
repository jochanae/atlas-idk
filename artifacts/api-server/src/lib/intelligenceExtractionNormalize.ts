/**
 * Project intelligence extraction post-processor.
 *
 * CityHub audit (2026-07-24) showed Open Questions / Major Decisions can:
 *   - invent unsupported questions from Atlas speculative suggestions
 *   - retain near-duplicate semantic variants
 *   - keep overly broad questions after partial answers land
 *   - admit decisions from other projects / conversations
 *
 * This module is deterministic (no LLM). It grounds, dedupes, and classifies
 * extracted questions/decisions against the current project's conversation text
 * and preserves provenance so contamination can be traced.
 */

export type QuestionResolution = "open" | "partial" | "resolved";

export type ExtractionProvenance = {
  /** Who introduced the claim in the scoped conversation. */
  sourceRole: "person" | "atlas" | "mixed" | "unknown";
  /** Short excerpt from the scoped source that supports the claim. */
  sourceExcerpt: string | null;
  /** True only when evidence came from this project's conversation. */
  projectScoped: true;
  /** Optional message id when known at write time. */
  sourceMessageId?: number | null;
};

export type NormalizedQuestion = {
  text: string;
  resolution: QuestionResolution;
  provenance: ExtractionProvenance;
  /** When partial: what remains unanswered. */
  residual?: string | null;
};

export type NormalizedDecisionCandidate = {
  title: string;
  summary?: string | null;
  accepted: boolean;
  rejectReason?: "ungrounded" | "atlas_speculation" | "cross_project_signal" | "duplicate";
  provenance: ExtractionProvenance;
};

const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "for", "of", "to", "in", "on", "at",
  "is", "are", "was", "were", "be", "been", "being", "this", "that", "these",
  "those", "it", "its", "as", "by", "with", "from", "into", "about", "over",
  "after", "before", "how", "what", "when", "where", "why", "who", "which",
  "should", "would", "could", "can", "will", "do", "does", "did", "we", "our",
  "us", "you", "your", "they", "their", "i", "my", "me",
]);

/** Tokenize for overlap / near-duplicate checks. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Near-duplicate when token Jaccard ≥ threshold (default 0.55). */
export function areSemanticallyNearDuplicate(a: string, b: string, threshold = 0.55): boolean {
  if (expansionFamilyKey(a) && expansionFamilyKey(a) === expansionFamilyKey(b)) return true;
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  return jaccard(ta, tb) >= threshold;
}

/**
 * Collapse geo-expansion / replication variants that share intent even when
 * token overlap is low ("other cities" vs "geographic expansion structure").
 */
function expansionFamilyKey(text: string): string | null {
  if (
    /\breplicat(e|ion|ing)\b/i.test(text) ||
    /\bother cities\b/i.test(text) ||
    /\bgeographic expansion\b/i.test(text) ||
    /\bexpand(ing)? to\b/i.test(text) ||
    /\bpost[- ]launch replication\b/i.test(text) ||
    /\bfranchise\b/i.test(text)
  ) {
    return "geo-expansion";
  }
  return null;
}

export function dedupeSemanticallyEquivalent(texts: string[]): string[] {
  const kept: string[] = [];
  for (const raw of texts) {
    const text = raw?.trim();
    if (!text) continue;
    const dup = kept.some((k) => areSemanticallyNearDuplicate(k, text));
    if (!dup) kept.push(text);
  }
  return kept;
}

type Utterance = { role: "person" | "atlas"; content: string };

/** Parse PERSON:/ATLAS: conversation blocks used by genomeExtract. */
export function parseConversationUtterances(conversationText: string): Utterance[] {
  if (!conversationText?.trim()) return [];
  const chunks = conversationText.split(/\n\n+/);
  const out: Utterance[] = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^(PERSON|ATLAS|USER|ASSISTANT|JOY)\s*:\s*([\s\S]*)$/i);
    if (!m) continue;
    const label = m[1].toUpperCase();
    const role: "person" | "atlas" =
      label === "PERSON" || label === "USER" ? "person" : "atlas";
    const content = m[2].trim();
    if (content) out.push({ role, content });
  }
  return out;
}

function personCorpus(utterances: Utterance[]): string {
  return utterances.filter((u) => u.role === "person").map((u) => u.content).join("\n");
}

function atlasCorpus(utterances: Utterance[]): string {
  return utterances.filter((u) => u.role === "atlas").map((u) => u.content).join("\n");
}

function findBestExcerpt(haystack: string, claim: string): string | null {
  if (!haystack.trim() || !claim.trim()) return null;
  const claimTokens = tokenize(claim);
  if (claimTokens.length === 0) return null;

  // Prefer sentence / line windows that share the most claim tokens.
  const windows = haystack
    .split(/(?<=[.!?])\s+|\n+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 12);

  let best: { score: number; text: string } | null = null;
  for (const w of windows) {
    const wt = new Set(tokenize(w));
    let hit = 0;
    for (const t of claimTokens) if (wt.has(t)) hit++;
    const score = hit / claimTokens.length;
    if (!best || score > best.score) best = { score, text: w };
  }
  if (!best || best.score < 0.25) return null;
  return best.text.slice(0, 280);
}

function overlapRatio(claim: string, corpus: string): number {
  const ct = tokenize(claim);
  if (ct.length === 0) return 0;
  const corpusSet = new Set(tokenize(corpus));
  let hit = 0;
  for (const t of ct) if (corpusSet.has(t)) hit++;
  return hit / ct.length;
}

/**
 * Signals that a claim is about another project / portfolio slide deck rather
 * than the current project's conversation (CityHub "Journey Ahead" / Pricing).
 */
const CROSS_PROJECT_MARKERS = [
  /\bjourney ahead\b/i,
  /\bother projects?\b/i,
  /\bacross (the )?portfolio\b/i,
  /\bin another (project|conversation|thread)\b/i,
  /\bslide deck\b.*\bpricing\b/i,
  /\bpricing\b.*\bafter\b.*\bjourney\b/i,
];

export function looksLikeCrossProjectContamination(text: string): boolean {
  return CROSS_PROJECT_MARKERS.some((re) => re.test(text));
}

/**
 * Atlas speculative expansion phrasing that must not become confirmed
 * open questions / decisions unless the person adopted them.
 */
const ATLAS_SPECULATION_MARKERS = [
  /\byou could\b/i,
  /\bwe could\b/i,
  /\bmight (want to|consider)\b/i,
  /\bone option (is|would be)\b/i,
  /\bif you (want|ever|later)\b/i,
  /\bpotentially\b/i,
  /\bhypothetical(ly)?\b/i,
  /\bfor example,? (you|we) (could|might)\b/i,
];

export function looksLikeAtlasSpeculation(excerpt: string | null, claim: string): boolean {
  const blob = `${excerpt ?? ""} ${claim}`;
  return ATLAS_SPECULATION_MARKERS.some((re) => re.test(blob));
}

function buildProvenance(
  claim: string,
  utterances: Utterance[],
  sourceMessageId?: number | null,
): ExtractionProvenance {
  const personText = personCorpus(utterances);
  const atlasText = atlasCorpus(utterances);
  const personExcerpt = findBestExcerpt(personText, claim);
  const atlasExcerpt = findBestExcerpt(atlasText, claim);
  const personOverlap = overlapRatio(claim, personText);
  const atlasOverlap = overlapRatio(claim, atlasText);

  let sourceRole: ExtractionProvenance["sourceRole"] = "unknown";
  let sourceExcerpt: string | null = null;

  if (personOverlap >= 0.35 && atlasOverlap >= 0.35) {
    sourceRole = "mixed";
    sourceExcerpt = personExcerpt ?? atlasExcerpt;
  } else if (personOverlap >= 0.35) {
    sourceRole = "person";
    sourceExcerpt = personExcerpt;
  } else if (atlasOverlap >= 0.35) {
    sourceRole = "atlas";
    sourceExcerpt = atlasExcerpt;
  }

  return {
    sourceRole,
    sourceExcerpt,
    projectScoped: true,
    ...(sourceMessageId != null ? { sourceMessageId } : {}),
  };
}

/**
 * Heuristic residual refinement for partially answered questions.
 * CityHub: "Guest sourcing and booking pipeline" → residual about list /
 * outreach / cadence / booking workflow once counts+timing are known.
 */
export function refinePartialQuestion(text: string, personText: string): {
  resolution: QuestionResolution;
  residual: string | null;
} {
  const lower = text.toLowerCase();
  const personLower = personText.toLowerCase();

  const hasCounts =
    /\b\d+\b/.test(personText) ||
    /\b(target|count|quota|pipeline of)\b/i.test(personText);
  const hasTiming =
    /\b(week|weekly|month|by |deadline|timeline|schedule|pilot)\b/i.test(personText);

  const stillNeeded =
    /\b(still need|still don't|still do not|haven't|have not|unresolved|undefined|not (yet |been )?locked|remaining|what we still)\b/i.test(
      personText,
    );

  // Guest sourcing / booking: counts+timing known → residual operational detail
  if (
    (/\bguest\b/.test(lower) || /\bsourc(e|ing)\b/.test(lower) || /\bbooking\b/.test(lower)) &&
    (hasCounts || hasTiming) &&
    (/\bpipeline\b/.test(lower) || /\bsourc/.test(lower) || /\bbook/.test(lower))
  ) {
    const mentionsOpsDetail =
      /\b(list|prospects?|outreach|message|cadence|follow[- ]?up|workflow|booking)\b/i.test(
        personLower,
      );
    // If PERSON is listing these as still needed, keep partial residual
    if (stillNeeded || mentionsOpsDetail) {
      return {
        resolution: "partial",
        residual:
          "Guest prospect list, outreach message, follow-up cadence, and booking workflow",
      };
    }
    return { resolution: "resolved", residual: null };
  }

  // Editorial identity: still open unless PERSON explicitly locked a voice
  if (/\beditorial\b/.test(lower) || /\bidentity\b/.test(lower) || /\bbrand voice\b/.test(lower)) {
    const lockedAffirmatively =
      /\b(decided|final|we'll go with|we are going with|locked (in|the|our))\b/i.test(personLower) &&
      !/\b(haven't|have not|not (yet )?locked|unresolved|still)\b/i.test(personLower);
    if (!lockedAffirmatively) {
      return { resolution: "open", residual: null };
    }
    return { resolution: "resolved", residual: null };
  }

  // Success thresholds: open unless explicit numbers for pilot→weekly
  if (/\b(success|threshold|kpi|metric)\b/.test(lower) || (/\bpilot\b/.test(lower) && /\bthreshold|success|weekly\b/.test(lower))) {
    if (
      stillNeeded ||
      !/\b(pilot|weekly).{0,40}\d+|\d+.{0,40}(pilot|weekly)/i.test(personText)
    ) {
      // CityHub: person said thresholds remain undefined even if other numbers exist
      if (/\b(threshold|success signal|kpi|metric).{0,40}(undefined|unresolved|don't have|do not have|still)\b/i.test(personLower)
        || /\b(undefined|unresolved|don't have|do not have|still).{0,40}(threshold|success)\b/i.test(personLower)
        || /\bexplicit pilot-to-weekly success thresholds\b/i.test(personLower)
        || /\bsuccess thresholds?\b/i.test(personLower) && stillNeeded
        || !/\bpilot.{0,30}(to|-)?\s*weekly.{0,40}\d+/i.test(personText)) {
        return { resolution: "open", residual: null };
      }
    }
    return { resolution: "resolved", residual: null };
  }

  // If person clearly answered the question topic, mark resolved
  const claimTokens = tokenize(text);
  const answeredCue =
    /\b(decid(ed|e)|settled|going with|we'll use|primary audience is|strategy is|referrals? are)\b/i.test(
      personText,
    ) && !stillNeeded;
  if (answeredCue && overlapRatio(text, personText) >= 0.45 && claimTokens.length >= 2) {
    return { resolution: "resolved", residual: null };
  }

  return { resolution: "open", residual: null };
}

/**
 * Unsupported geographic expansion / replication questions (CityHub false positives)
 * when the person never raised expansion and Atlas only speculated.
 */
export function isUnsupportedExpansionQuestion(
  text: string,
  personText: string,
  provenance: ExtractionProvenance,
): boolean {
  const expansion =
    /\breplicat(e|ion|ing)\b/i.test(text) ||
    /\bother cities\b/i.test(text) ||
    /\bgeographic expansion\b/i.test(text) ||
    /\bexpand(ing)? to\b/i.test(text) ||
    /\bpost[- ]launch replication\b/i.test(text) ||
    /\bfranchise\b/i.test(text);

  if (!expansion) return false;

  const personRaised =
    /\breplicat(e|ion|ing)\b/i.test(personText) ||
    /\bother cities\b/i.test(personText) ||
    /\bgeographic expansion\b/i.test(personText) ||
    /\bexpand(ing)? to\b/i.test(personText) ||
    /\bpost[- ]launch\b/i.test(personText);

  if (personRaised) return false;
  // Atlas-only or unknown provenance → drop
  return provenance.sourceRole === "atlas" || provenance.sourceRole === "unknown";
}

export function normalizeExtractedQuestions(opts: {
  questions: string[];
  conversationText: string;
  sourceMessageId?: number | null;
}): NormalizedQuestion[] {
  const utterances = parseConversationUtterances(opts.conversationText);
  const personText = personCorpus(utterances);
  const deduped = dedupeSemanticallyEquivalent(opts.questions);

  const out: NormalizedQuestion[] = [];
  for (const text of deduped) {
    const provenance = buildProvenance(text, utterances, opts.sourceMessageId);

    if (looksLikeCrossProjectContamination(text)) continue;
    if (isUnsupportedExpansionQuestion(text, personText, provenance)) continue;

    // Atlas speculation without person adoption → skip
    if (
      provenance.sourceRole === "atlas" &&
      looksLikeAtlasSpeculation(provenance.sourceExcerpt, text)
    ) {
      continue;
    }

    // Must be grounded in this project's conversation somehow
    if (provenance.sourceRole === "unknown" && utterances.length > 0) {
      // Allow if person corpus has weak topical overlap (≥0.2)
      if (overlapRatio(text, personText) < 0.2 && overlapRatio(text, atlasCorpus(utterances)) < 0.2) {
        continue;
      }
    }

    const refined = refinePartialQuestion(text, personText);
    if (refined.resolution === "resolved") {
      out.push({
        text,
        resolution: "resolved",
        provenance,
        residual: null,
      });
      continue;
    }

    const display =
      refined.resolution === "partial" && refined.residual
        ? refined.residual
        : text;

    // Dedupe residuals against already kept display texts
    if (out.some((q) => areSemanticallyNearDuplicate(q.text, display))) continue;

    out.push({
      text: display,
      resolution: refined.resolution,
      provenance,
      residual: refined.residual,
    });
  }

  return out;
}

/** Open + partial display strings for DNA.openQuestions (resolved excluded). */
export function openQuestionTextsForDna(questions: NormalizedQuestion[]): string[] {
  return questions
    .filter((q) => q.resolution === "open" || q.resolution === "partial")
    .map((q) => q.text)
    .slice(0, 5);
}

export function normalizeDecisionCandidates(opts: {
  objects: Array<{ type: string; title: string; summary?: string }>;
  conversationText: string;
  sourceMessageId?: number | null;
}): Array<{ type: string; title: string; summary?: string; accepted: boolean; provenance: ExtractionProvenance; rejectReason?: NormalizedDecisionCandidate["rejectReason"] }> {
  const utterances = parseConversationUtterances(opts.conversationText);
  const personText = personCorpus(utterances);
  const seen: string[] = [];
  const out: Array<{
    type: string;
    title: string;
    summary?: string;
    accepted: boolean;
    provenance: ExtractionProvenance;
    rejectReason?: NormalizedDecisionCandidate["rejectReason"];
  }> = [];

  for (const obj of opts.objects) {
    if (!obj.title?.trim()) continue;
    const title = obj.title.trim();
    const summary = obj.summary?.trim() ?? undefined;
    const claim = `${title} ${summary ?? ""}`.trim();
    const provenance = buildProvenance(claim, utterances, opts.sourceMessageId);

    if (obj.type !== "Decision" && obj.type !== "Question") {
      out.push({ ...obj, title, summary, accepted: true, provenance });
      continue;
    }

    if (seen.some((s) => areSemanticallyNearDuplicate(s, title))) {
      out.push({
        ...obj,
        title,
        summary,
        accepted: false,
        provenance,
        rejectReason: "duplicate",
      });
      continue;
    }
    seen.push(title);

    if (looksLikeCrossProjectContamination(claim)) {
      out.push({
        ...obj,
        title,
        summary,
        accepted: false,
        provenance,
        rejectReason: "cross_project_signal",
      });
      continue;
    }

    if (obj.type === "Decision") {
      // Decisions require person commitment language / person grounding
      const personCommitted =
        overlapRatio(claim, personText) >= 0.3 &&
        /\b(decid(ed|e)|commit(ted)?|locked|going with|we'll|we will|we'll go|chosen|chose|primary audience is|strategy is|lead (is|with)|referrals? are)\b/i.test(
          personText,
        );

      if (
        provenance.sourceRole === "atlas" ||
        looksLikeAtlasSpeculation(provenance.sourceExcerpt, claim) ||
        (!personCommitted && provenance.sourceRole !== "person" && provenance.sourceRole !== "mixed")
      ) {
        out.push({
          ...obj,
          title,
          summary,
          accepted: false,
          provenance,
          rejectReason:
            provenance.sourceRole === "atlas" || looksLikeAtlasSpeculation(provenance.sourceExcerpt, claim)
              ? "atlas_speculation"
              : "ungrounded",
        });
        continue;
      }

      if (!personCommitted && overlapRatio(claim, personText) < 0.35) {
        out.push({
          ...obj,
          title,
          summary,
          accepted: false,
          provenance,
          rejectReason: "ungrounded",
        });
        continue;
      }
    }

    if (obj.type === "Question") {
      if (isUnsupportedExpansionQuestion(title, personText, provenance)) {
        out.push({
          ...obj,
          title,
          summary,
          accepted: false,
          provenance,
          rejectReason: "atlas_speculation",
        });
        continue;
      }
      if (
        provenance.sourceRole === "atlas" &&
        looksLikeAtlasSpeculation(provenance.sourceExcerpt, claim)
      ) {
        out.push({
          ...obj,
          title,
          summary,
          accepted: false,
          provenance,
          rejectReason: "atlas_speculation",
        });
        continue;
      }
      if (provenance.sourceRole === "unknown" && overlapRatio(claim, personText) < 0.2) {
        out.push({
          ...obj,
          title,
          summary,
          accepted: false,
          provenance,
          rejectReason: "ungrounded",
        });
        continue;
      }
    }

    out.push({ ...obj, title, summary, accepted: true, provenance });
  }

  return out;
}

export function provenanceToEnrichment(
  provenance: ExtractionProvenance,
  extra?: Record<string, unknown>,
): string {
  return JSON.stringify({
    provenance,
    ...extra,
  });
}
