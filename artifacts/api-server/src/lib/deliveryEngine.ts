// Delivery Engine — Phase 2 completion
//
// The Artifact Engine creates things (drafts, docs, decks). The Delivery
// Engine distributes them. These are deliberately separate systems: if
// Resend, Slack, or GitHub is down/misconfigured/rate-limited, artifact
// generation is still considered successful — delivery is a distinct,
// retryable, independently-failing step recorded in its own table.
//
// Every provider (email/slack/github_pr today; discord/teams/notion later)
// plugs in behind the same adapter contract so the engine, routes, and UI
// never need to know provider-specific details.
import { db, deliveriesTable, type DeliveryProvider } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getFileBackedArtifact } from "./artifactEngine";

export interface DeliverySendResult {
  /** Provider-specific reference to the delivered item (message ts, PR url, email id, etc). */
  externalRef: Record<string, unknown>;
}

export interface DeliveryContext {
  /** Resolved artifact preview payload (title/body/etc — never the raw file buffer). */
  preview: Record<string, unknown>;
  title: string;
  /** Arbitrary caller-supplied auth/config the adapter needs (e.g. a GitHub token). */
  auth?: Record<string, unknown>;
}

export interface DeliveryAdapter {
  provider: DeliveryProvider;
  /** Human-facing label for UI ("Send Email", "Post to Slack", "Open Pull Request"). */
  label: string;
  /** Validates + normalizes the caller-supplied target (email address, channel id, repo/branch). Throws on invalid input. */
  validateTarget(target: Record<string, unknown>): Record<string, unknown>;
  /** Delivers the artifact to the target. Throws on failure — the engine records it as "failed", never silently swallows it. */
  send(target: Record<string, unknown>, context: DeliveryContext): Promise<DeliverySendResult>;
}

const adapters = new Map<DeliveryProvider, DeliveryAdapter>();

export function registerDeliveryAdapter(adapter: DeliveryAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function getDeliveryAdapter(provider: string): DeliveryAdapter | undefined {
  return adapters.get(provider as DeliveryProvider);
}

export function listDeliveryProviders(): DeliveryProvider[] {
  return Array.from(adapters.keys());
}

export interface DeliverArtifactParams {
  projectId: number;
  artifactId: number;
  provider: string;
  target: Record<string, unknown>;
  auth?: Record<string, unknown>;
}

export interface DeliveryResult {
  id: number;
  projectId: number;
  artifactId: number;
  provider: string;
  target: Record<string, unknown>;
  status: "sent" | "failed";
  externalRef: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

/**
 * Runs the full delivery pipeline for one already-generated artifact:
 * validate target → load artifact preview → call the provider adapter →
 * persist the outcome (sent or failed) in `deliveries`. Never throws for
 * provider failures — those are recorded as a "failed" row and returned
 * normally so the caller can surface a clean error to the user.
 */
export async function deliverArtifact(params: DeliverArtifactParams): Promise<DeliveryResult> {
  const { projectId, artifactId, provider, target, auth } = params;

  const adapter = getDeliveryAdapter(provider);
  if (!adapter) {
    throw new Error(`Delivery engine: no adapter registered for provider "${provider}"`);
  }

  const found = await getFileBackedArtifact(projectId, artifactId);
  if (!found) {
    throw new Error("Delivery engine: artifact not found");
  }

  const normalizedTarget = adapter.validateTarget(target);
  const payload = (found.row.payload as Record<string, unknown>) ?? {};
  const preview = (payload.preview as Record<string, unknown>) ?? {};

  const [row] = await db
    .insert(deliveriesTable)
    .values({
      projectId,
      artifactId,
      provider,
      target: normalizedTarget,
      status: "pending",
    })
    .returning();

  try {
    const result = await adapter.send(normalizedTarget, {
      preview,
      title: found.row.title,
      auth,
    });

    const [updated] = await db
      .update(deliveriesTable)
      .set({ status: "sent", externalRef: result.externalRef, sentAt: new Date() })
      .where(eq(deliveriesTable.id, row.id))
      .returning();

    return toDeliveryResult(updated ?? row, "sent", result.externalRef, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, projectId, artifactId, provider }, "deliveryEngine: send failed");

    const [updated] = await db
      .update(deliveriesTable)
      .set({ status: "failed", error: message })
      .where(eq(deliveriesTable.id, row.id))
      .returning();

    return toDeliveryResult(updated ?? row, "failed", null, message);
  }
}

function toDeliveryResult(
  row: typeof deliveriesTable.$inferSelect,
  status: "sent" | "failed",
  externalRef: Record<string, unknown> | null,
  error: string | null,
): DeliveryResult {
  return {
    id: row.id,
    projectId: row.projectId,
    artifactId: row.artifactId,
    provider: row.provider,
    target: row.target as Record<string, unknown>,
    status,
    externalRef,
    error,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}
