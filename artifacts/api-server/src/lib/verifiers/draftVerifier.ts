// Draft (email/slack/pr/changelog) verifier — F6A Stage 3.
// Confirms the persisted draft actually matches the subtype that was
// requested (a "draft_email" that silently rendered PR-shaped content would
// be a real content-shape bug, not just a formatting nit) and that the body
// has real, nonempty content.
import { registerArtifactVerifier, type VerificationCheck, type VerifierContext } from "../verificationEngine";

const KNOWN_DRAFT_TYPES = new Set(["draft_email", "draft_slack", "draft_pr", "draft_changelog"]);

for (const draftType of KNOWN_DRAFT_TYPES) {
  registerArtifactVerifier({
    type: draftType,
    async verify(ctx) {
      return verifyDraft(draftType, ctx);
    },
  });
}

async function verifyDraft(
  requestedType: string,
  { buffer, rendered }: VerifierContext,
): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  const body = buffer.toString("utf-8").trim();

  const nonEmpty = body.length > 0;
  checks.push({
    key: "draft-nonempty-body",
    pass: nonEmpty,
    ...(nonEmpty ? {} : { reason: "Draft body is empty." }),
  });

  const preview = (rendered.preview ?? {}) as { draftType?: string };
  const declaredType = preview.draftType;
  checks.push({
    key: "draft-subtype-recognized",
    pass: !!declaredType && KNOWN_DRAFT_TYPES.has(declaredType),
    ...(declaredType && KNOWN_DRAFT_TYPES.has(declaredType)
      ? {}
      : { reason: `Preview declares an unrecognized draft subtype: "${declaredType ?? "none"}".` }),
  });

  const subtypeMatches = declaredType === requestedType;
  checks.push({
    key: "draft-subtype-matches-request",
    pass: subtypeMatches,
    ...(subtypeMatches
      ? {}
      : {
          reason: `Requested "${requestedType}" but the generated draft is tagged as "${declaredType ?? "unknown"}" — content-shape mismatch.`,
        }),
  });

  return checks;
}
