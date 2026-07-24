import { describe, expect, it } from "vitest";
import {
  areSemanticallyNearDuplicate,
  dedupeSemanticallyEquivalent,
  normalizeDecisionCandidates,
  normalizeExtractedQuestions,
  openQuestionTextsForDna,
} from "../intelligenceExtractionNormalize";

/**
 * CityHub-shaped conversation fixture encoding the 2026-07-24 extraction audit.
 * PERSON statements are grounded; ATLAS expands with speculation that must NOT
 * become confirmed open questions or decisions.
 */
const CITYHUB_CONVERSATION = `
PERSON: CityHub is a local show for entrepreneurs in our city. Editorial identity is still unresolved — we haven't locked the voice yet.

ATLAS: Got it. Primary focus is local founders. You could also think about a replication model for other cities later, and a geographic expansion structure once the pilot works. Post-launch replication model is another option.

PERSON: Yes — primary audience is local entrepreneurs. Guest referrals are the lead distribution strategy. For the pilot we want guests, but we still don't have explicit pilot-to-weekly success thresholds defined.

ATLAS: Let's set target counts and timing: aim for 8 guest referrals in the first 3 weeks. Guest sourcing and booking pipeline is the next big question.

PERSON: Those counts and timing work as targets. What we still need is the actual prospect list, outreach message, follow-up cadence, and booking workflow.

ATLAS: In another project we moved Pricing after the Journey Ahead slide — want to do the same here?
`.trim();

describe("intelligenceExtractionNormalize — CityHub audit", () => {
  it("deduplicates near-duplicate replication / expansion questions", () => {
    const raw = [
      "replication model for other cities",
      "geographic expansion structure",
      "post-launch replication model",
      "Editorial identity remains unresolved",
    ];
    const deduped = dedupeSemanticallyEquivalent(raw);
    // Three expansion variants collapse to one (or fewer) + editorial
    expect(deduped.length).toBeLessThanOrEqual(2);
    expect(areSemanticallyNearDuplicate(
      "replication model for other cities",
      "post-launch replication model",
    )).toBe(true);
  });

  it("drops unsupported expansion questions Atlas invented", () => {
    const normalized = normalizeExtractedQuestions({
      questions: [
        "Editorial identity remains unresolved",
        "replication model for other cities",
        "geographic expansion structure",
        "post-launch replication model",
        "Explicit pilot-to-weekly success thresholds",
        "Guest sourcing and booking pipeline",
      ],
      conversationText: CITYHUB_CONVERSATION,
    });

    const texts = normalized.map((q) => q.text.toLowerCase());
    expect(texts.some((t) => t.includes("replicat"))).toBe(false);
    expect(texts.some((t) => t.includes("geographic expansion"))).toBe(false);
    expect(texts.some((t) => t.includes("other cities"))).toBe(false);
  });

  it("keeps grounded open questions (editorial identity, success thresholds)", () => {
    const normalized = normalizeExtractedQuestions({
      questions: [
        "Editorial identity remains unresolved",
        "Explicit pilot-to-weekly success thresholds remain undefined",
        "replication model for other cities",
      ],
      conversationText: CITYHUB_CONVERSATION,
    });

    const openish = openQuestionTextsForDna(normalized);
    expect(openish.some((q) => /editorial/i.test(q))).toBe(true);
    expect(openish.some((q) => /threshold|success|pilot/i.test(q))).toBe(true);
    expect(openish.some((q) => /replicat|geographic|other cities/i.test(q))).toBe(false);
  });

  it("narrows guest sourcing to residual operational question (partial)", () => {
    const normalized = normalizeExtractedQuestions({
      questions: ["Guest sourcing and booking pipeline"],
      conversationText: CITYHUB_CONVERSATION,
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0].resolution).toBe("partial");
    expect(normalized[0].text.toLowerCase()).toMatch(/prospect|outreach|cadence|booking/);
    expect(normalized[0].text.toLowerCase()).not.toBe("guest sourcing and booking pipeline");
  });

  it("rejects cross-project Pricing / Journey Ahead decision contamination", () => {
    const decisions = normalizeDecisionCandidates({
      objects: [
        {
          type: "Decision",
          title: "Move Pricing after Journey Ahead slide",
          summary: "Deck order change from another project",
        },
        {
          type: "Decision",
          title: "Guest referrals are the lead distribution strategy",
          summary: "Person committed referrals as primary lead channel",
        },
        {
          type: "Decision",
          title: "Primary audience is local entrepreneurs",
          summary: "Person stated primary audience",
        },
      ],
      conversationText: CITYHUB_CONVERSATION,
    });

    const pricing = decisions.find((d) => /pricing/i.test(d.title));
    expect(pricing?.accepted).toBe(false);
    expect(pricing?.rejectReason).toBe("cross_project_signal");

    const referrals = decisions.find((d) => /referral/i.test(d.title));
    expect(referrals?.accepted).toBe(true);
    expect(referrals?.provenance.sourceRole === "person" || referrals?.provenance.sourceRole === "mixed").toBe(true);

    const audience = decisions.find((d) => /audience|entrepreneur/i.test(d.title));
    expect(audience?.accepted).toBe(true);
  });

  it("does not convert Atlas speculative suggestions into decisions", () => {
    const decisions = normalizeDecisionCandidates({
      objects: [
        {
          type: "Decision",
          title: "Pursue geographic expansion structure",
          summary: "Atlas suggested expanding to other cities",
        },
      ],
      conversationText: CITYHUB_CONVERSATION,
    });
    expect(decisions[0].accepted).toBe(false);
    expect(["atlas_speculation", "ungrounded", "cross_project_signal"]).toContain(
      decisions[0].rejectReason,
    );
  });

  it("preserves provenance on accepted grounded questions", () => {
    const normalized = normalizeExtractedQuestions({
      questions: ["Editorial identity remains unresolved"],
      conversationText: CITYHUB_CONVERSATION,
      sourceMessageId: 42,
    });
    expect(normalized[0].provenance.projectScoped).toBe(true);
    expect(normalized[0].provenance.sourceMessageId).toBe(42);
    expect(normalized[0].provenance.sourceRole).toBe("person");
    expect(normalized[0].provenance.sourceExcerpt).toBeTruthy();
  });

  it("DNA openQuestions exclude resolved and unsupported items", () => {
    const normalized = normalizeExtractedQuestions({
      questions: [
        "Editorial identity remains unresolved",
        "replication model for other cities",
        "geographic expansion structure",
        "post-launch replication model",
        "Guest sourcing and booking pipeline",
        "Explicit pilot-to-weekly success thresholds remain undefined",
      ],
      conversationText: CITYHUB_CONVERSATION,
    });
    const dna = openQuestionTextsForDna(normalized);
    expect(dna.length).toBeGreaterThanOrEqual(2);
    expect(dna.length).toBeLessThanOrEqual(5);
    // No expansion duplicates
    const expansionHits = dna.filter((q) =>
      /replicat|geographic expansion|other cities/i.test(q),
    );
    expect(expansionHits).toHaveLength(0);
  });
});
