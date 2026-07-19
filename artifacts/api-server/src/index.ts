import app from "./app";
import { db, pool } from "@workspace/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "./lib/logger";
import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { startScheduledChecksWorker } from "./lib/scheduledChecksWorker";
import { startCapacityResetWorker } from "./lib/capacityResetWorker";
import { startAttachmentRetentionWorker } from "./lib/attachmentRetentionWorker";
import { seedMissingGenomes, backfillEmptyGenomes, seedMissingSessionsForCommitted } from "./lib/genomeExtract";
import { seedMissingApplicationModels } from "./routes/applicationModel";
import { migrateGenomeToApplicationModel } from "./lib/projectDNA";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  try {
    // @ts-ignore — stripe-replit-sync is an optional Replit-managed package
    const { runMigrations } = await import('stripe-replit-sync');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for Stripe');

    logger.info('Initializing Stripe schema...');
    await runMigrations({ databaseUrl } as Parameters<typeof runMigrations>[0]);
    logger.info('Stripe schema ready');

    const { getStripeSync } = await import('./stripeClient');
    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info('Stripe webhook configured');

    stripeSync.syncBackfill()
      .then(() => logger.info('Stripe backfill complete'))
      .catch((err: any) => logger.error({ err }, 'Stripe backfill error'));
  } catch (err: any) {
    logger.error({ err }, 'Stripe init failed — continuing without Stripe');
  }
}

// Run drizzle-kit push as a child process to sync schema with the live database.
// This is the production equivalent of `pnpm --filter @workspace/db run push`.
// It runs on every startup so the database schema never falls behind the code.
async function pushSchema(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping schema push");
    return;
  }

  return new Promise((resolve) => {
    const child = spawn("npx", [
      "drizzle-kit",
      "push",
      "--config", "../../lib/db/drizzle.config.ts",
      "--force",
    ], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("close", (code) => {
      if (code === 0) {
        logger.info("Schema push: applied cleanly");
      } else {
        logger.warn({ code, stdout: stdout.trim(), stderr: stderr.trim() }, "Schema push: non-zero exit — server will start anyway");
      }
      resolve();
    });

    child.on("error", (err) => {
      logger.warn({ err }, "Schema push: spawn failed — server will start anyway");
      resolve();
    });
  });
}

// Idempotent SQL safety-net: ensures any columns/tables that drizzle-kit push
// may have missed (e.g. because it needs a TTY for interactive prompts) are
// present before serving. Add new tables/columns here rather than relying on
// drizzle-kit in non-TTY environments.
async function ensureColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS conv_state text
    `);
    logger.info("ensureColumns: projects.conv_state verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: projects.conv_state failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS conversation_id text
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS projects_conversation_id_uq
        ON projects (conversation_id)
        WHERE conversation_id IS NOT NULL
    `);
    logger.info("ensureColumns: projects.conversation_id verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: projects.conversation_id failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE project_flow_canvas
        ADD COLUMN IF NOT EXISTS drill_cache jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    logger.info("ensureColumns: drill_cache column verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: drill_cache failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS application_models (
        id serial PRIMARY KEY,
        project_id integer NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        version integer NOT NULL DEFAULT 1,
        identity jsonb NOT NULL DEFAULT '{}',
        intent jsonb NOT NULL DEFAULT '{}',
        pages jsonb NOT NULL DEFAULT '[]',
        components jsonb NOT NULL DEFAULT '[]',
        data jsonb NOT NULL DEFAULT '{"entities":[],"relationships":[]}',
        logic jsonb NOT NULL DEFAULT '[]',
        build_state jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS application_model_history (
        id serial PRIMARY KEY,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        model_version integer NOT NULL,
        field_changed text NOT NULL,
        previous_value jsonb,
        new_value jsonb,
        reason text,
        changed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: application_models tables verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: application_models tables failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE entries
        ADD COLUMN IF NOT EXISTS am_field text,
        ADD COLUMN IF NOT EXISTS catch_against_id integer,
        ADD COLUMN IF NOT EXISTS deviation_reason text,
        ADD COLUMN IF NOT EXISTS card_schema_version integer DEFAULT 1,
        ADD COLUMN IF NOT EXISTS source_message_id integer
    `);
    logger.info("ensureColumns: entries.am_field + decision-catch columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: entries.am_field failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE nexus_messages
        ADD COLUMN IF NOT EXISTS metadata jsonb,
        ADD COLUMN IF NOT EXISTS message_type text
    `);
    logger.info("ensureColumns: nexus_messages.metadata + message_type columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: nexus_messages columns failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_artifacts (
        id serial PRIMARY KEY,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type text NOT NULL,
        version integer NOT NULL DEFAULT 1,
        title text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_artifacts_project_id_idx
        ON project_artifacts (project_id, created_at DESC)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS project_artifacts_version_uniq
        ON project_artifacts (project_id, type, version)
    `);
    logger.info("ensureColumns: project_artifacts table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_artifacts table failed — server will start anyway");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deliveries (
        id serial PRIMARY KEY,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        artifact_id integer NOT NULL REFERENCES project_artifacts(id) ON DELETE CASCADE,
        provider text NOT NULL,
        target jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending',
        external_ref jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS deliveries_artifact_id_idx
        ON deliveries (artifact_id, created_at DESC)
    `);
    logger.info("ensureColumns: deliveries table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: deliveries table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_dna (
        id serial PRIMARY KEY,
        project_id integer NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        creative_principles jsonb NOT NULL DEFAULT '[]'::jsonb,
        experience_intent jsonb NOT NULL DEFAULT '{}'::jsonb,
        visual_sketches jsonb NOT NULL DEFAULT '[]'::jsonb,
        confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        status jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: project_dna table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_dna table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS conversation_id text
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS execution_runs_conversation_id_idx
        ON execution_runs (project_id, conversation_id)
        WHERE conversation_id IS NOT NULL
    `);
    logger.info("ensureColumns: execution_runs.conversation_id verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: execution_runs.conversation_id failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_checkpoints (
        id text PRIMARY KEY,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type text NOT NULL,
        label text NOT NULL DEFAULT '',
        title text NOT NULL,
        notes text,
        created_by text NOT NULL DEFAULT 'system',
        dna_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        am_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        build_ref text,
        message_ref integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_checkpoints_project_id_idx
        ON project_checkpoints (project_id, created_at DESC)
    `);
    logger.info("ensureColumns: project_checkpoints table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_checkpoints table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ledger_assets (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'Other',
        value_cents BIGINT NOT NULL DEFAULT 0,
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ledger_transactions (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        asset_id    INTEGER REFERENCES ledger_assets(id) ON DELETE SET NULL,
        action      TEXT NOT NULL,
        amount_cents BIGINT NOT NULL DEFAULT 0,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ledger_assets_user_idx ON ledger_assets (user_id, created_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ledger_transactions_user_idx ON ledger_transactions (user_id, created_at DESC)
    `);
    logger.info("ensureColumns: ledger_assets + ledger_transactions tables verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: ledger tables failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_builds (
        id          text PRIMARY KEY,
        project_id  integer REFERENCES projects(id) ON DELETE SET NULL,
        command     text NOT NULL,
        status      text NOT NULL DEFAULT 'running',
        output      text,
        error_summary text,
        started_at  timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_builds_project_id_idx
        ON project_builds (project_id, started_at DESC)
    `);
    logger.info("ensureColumns: project_builds table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_builds table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_stack (
        id             serial PRIMARY KEY,
        project_id     integer NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        frontend       text,
        backend        text,
        database       text,
        hosting        text,
        auth           text,
        integrations   jsonb NOT NULL DEFAULT '[]'::jsonb,
        repo           text,
        language       text,
        package_manager text,
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: project_stack table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_stack table failed — server will start anyway");
  }

  // Atomic migration: verify ALL source columns exist, copy data, then drop — in one transaction.
  // The DROP only executes if the INSERT succeeds; the transaction rolls back on any error so
  // the legacy columns are never lost without a confirmed successful copy.
  try {
    const colCheck = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'application_models'
        AND column_name IN ('creative_principles', 'experience_intent', 'visual_sketches')
    `);
    const presentCols = new Set(
      (colCheck as unknown as { rows: Array<{ column_name: string }> }).rows.map((r) => r.column_name),
    );

    if (presentCols.size === 0) {
      logger.info("ensureColumns: project_dna migration skipped — legacy columns already absent");
    } else if (presentCols.size < 3) {
      // Partial column presence — abort rather than guess; leave columns intact for manual review.
      logger.warn(
        { presentCols: [...presentCols] },
        "ensureColumns: partial legacy DNA columns detected — migration aborted to prevent data loss",
      );
    } else {
      // All 3 source columns confirmed present. Run copy + drop in one transaction:
      // PostgreSQL DDL is transactional — DROP COLUMN rolls back if copy fails.
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO project_dna (project_id, creative_principles, experience_intent, visual_sketches)
          SELECT
            am.project_id,
            COALESCE(am.creative_principles, '[]'::jsonb),
            COALESCE(am.experience_intent, '{}'::jsonb),
            COALESCE(am.visual_sketches, '[]'::jsonb)
          FROM application_models am
          WHERE
            am.creative_principles::text <> '[]'
            OR am.experience_intent::text <> '{}'
            OR am.visual_sketches::text <> '[]'
          ON CONFLICT (project_id) DO NOTHING
        `);
        await tx.execute(sql`
          ALTER TABLE application_models
            DROP COLUMN IF EXISTS creative_principles,
            DROP COLUMN IF EXISTS experience_intent,
            DROP COLUMN IF EXISTS visual_sketches
        `);
      });
      logger.info("ensureColumns: project_dna migration + legacy column drop completed atomically");
    }
  } catch (err) {
    logger.error({ err }, "ensureColumns: project_dna migration failed — legacy columns preserved");
  }

  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS session_summary text,
        ADD COLUMN IF NOT EXISTS session_summary_at timestamptz
    `);
    logger.info("ensureColumns: projects.session_summary columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: projects.session_summary failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS initial_message text
    `);
    logger.info("ensureColumns: projects.initial_message verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: projects.initial_message failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS global_narrative     text,
        ADD COLUMN IF NOT EXISTS global_narrative_at  timestamptz
    `);
    logger.info("ensureColumns: users.global_narrative columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: users.global_narrative failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_bookmarks (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL,
        message_id  INTEGER,
        local_id    TEXT,
        title       TEXT NOT NULL,
        lens        TEXT,
        payload_json TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (project_id, user_id, local_id)
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_project_bookmarks_project_user
      ON project_bookmarks(project_id, user_id)
    `);
    logger.info("ensureColumns: project_bookmarks table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_bookmarks table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS file_edits_json   text,
        ADD COLUMN IF NOT EXISTS file_deletes_json text,
        ADD COLUMN IF NOT EXISTS line_patches_json text,
        ADD COLUMN IF NOT EXISTS catch_payload     jsonb
    `);
    logger.info("ensureColumns: chat_messages run-card + catch_payload columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: chat_messages run-card columns failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id      integer REFERENCES chat_messages(id) ON DELETE SET NULL,
        project_id      integer REFERENCES projects(id) ON DELETE CASCADE,
        user_id         integer REFERENCES users(id) ON DELETE SET NULL,
        step_count      integer NOT NULL DEFAULT 0,
        stop_reason     text NOT NULL,
        tools_called    jsonb NOT NULL DEFAULT '[]'::jsonb,
        total_tokens_in integer NOT NULL DEFAULT 0,
        total_tokens_out integer NOT NULL DEFAULT 0,
        started_at      timestamptz NOT NULL DEFAULT now(),
        ended_at        timestamptz
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_message_id ON agent_runs(message_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_project_user ON agent_runs(project_id, user_id)
    `);
    logger.info("ensureColumns: agent_runs table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: agent_runs table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE generation_runs
        ADD COLUMN IF NOT EXISTS chat_message_id integer
    `);
    logger.info("ensureColumns: generation_runs.chat_message_id verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: generation_runs.chat_message_id failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_resume_snapshots (
        user_id      INTEGER PRIMARY KEY,
        data_json    TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("ensureColumns: user_resume_snapshots table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: user_resume_snapshots table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS share_token text
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS projects_share_token_uq
        ON projects (share_token)
        WHERE share_token IS NOT NULL
    `);
    logger.info("ensureColumns: projects.share_token verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: projects.share_token failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS publish_token text,
        ADD COLUMN IF NOT EXISTS published_at  timestamptz
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS projects_publish_token_uq
        ON projects (publish_token)
        WHERE publish_token IS NOT NULL
    `);
    logger.info("ensureColumns: projects.publish_token + published_at verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: projects.publish_token failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS execution_runs (
        id          TEXT        PRIMARY KEY,
        project_id  INTEGER     NOT NULL,
        thread_id   INTEGER,
        message_id  INTEGER,
        mode        TEXT        NOT NULL DEFAULT 'conversation',
        status      TEXT        NOT NULL DEFAULT 'running',
        summary     TEXT,
        receipts    JSONB,
        started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        elapsed_ms  INTEGER
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS execution_runs_project_id_idx
        ON execution_runs (project_id, started_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS execution_runs_message_id_idx
        ON execution_runs (message_id)
        WHERE message_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS execution_run_steps (
        id         SERIAL      PRIMARY KEY,
        run_id     TEXT        NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
        verb       TEXT        NOT NULL,
        target     TEXT,
        status     TEXT        DEFAULT 'ok',
        detail     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS execution_run_steps_run_id_idx
        ON execution_run_steps (run_id, created_at)
    `);
    await db.execute(sql`
      ALTER TABLE execution_run_steps ADD COLUMN IF NOT EXISTS content TEXT
    `);
    await db.execute(sql`
      ALTER TABLE execution_run_steps ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE execution_run_steps ADD COLUMN IF NOT EXISTS before_content TEXT
    `);
    await db.execute(sql`
      ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS intent TEXT
    `);
    await db.execute(sql`
      ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS prompt TEXT
    `);
    await db.execute(sql`
      ALTER TABLE execution_run_steps ADD COLUMN IF NOT EXISTS artifact_url TEXT
    `);
    // Monotonic insertion-order tie-breaker. `started_at` alone is not enough:
    // a milestone run and its turn's code-execution run are both stamped with
    // the same turn startedAt (by design, for correct cross-turn ordering),
    // so reads sorting only by started_at DESC leave same-turn runs in
    // non-deterministic order. `seq` is populated by DB identity/serial at
    // insert time, so it reflects true write order regardless of what
    // started_at value the caller passed in.
    await db.execute(sql`
      ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS seq SERIAL
    `);
    logger.info("ensureColumns: execution_runs + execution_run_steps tables verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: execution_runs tables failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS design_plans (
        id           SERIAL      PRIMARY KEY,
        project_id   INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version      INTEGER     NOT NULL DEFAULT 1,
        status       TEXT        NOT NULL DEFAULT 'draft',
        body         JSONB       NOT NULL DEFAULT '{}'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        committed_at TIMESTAMPTZ
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS design_plans_project_id_idx
        ON design_plans (project_id, version DESC)
    `);
    logger.info("ensureColumns: design_plans table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: design_plans table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS thinking_receipts (
        id              SERIAL       PRIMARY KEY,
        user_id         INTEGER      NOT NULL,
        conversation_id TEXT         NOT NULL,
        turn_index      INTEGER      NOT NULL DEFAULT 0,
        headline        TEXT         NOT NULL,
        body            TEXT         NOT NULL,
        category        TEXT         NOT NULL DEFAULT 'Insight',
        confidence      INTEGER      NOT NULL DEFAULT 70,
        dismissed       BOOLEAN      NOT NULL DEFAULT false,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS thinking_receipts_user_conv_idx
        ON thinking_receipts (user_id, conversation_id, created_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS thinking_receipts_user_active_idx
        ON thinking_receipts (user_id, dismissed, created_at DESC)
    `);
    await db.execute(sql`
      ALTER TABLE thinking_receipts
        ADD COLUMN IF NOT EXISTS is_stable BOOLEAN NOT NULL DEFAULT false
    `);
    logger.info("ensureColumns: thinking_receipts table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: thinking_receipts table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS home_artifacts (
        id              SERIAL       PRIMARY KEY,
        user_id         INTEGER      NOT NULL,
        conversation_id TEXT,
        type            TEXT         NOT NULL DEFAULT 'document',
        title           TEXT         NOT NULL,
        content         TEXT         NOT NULL,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS home_artifacts_user_id_idx
        ON home_artifacts (user_id, created_at DESC)
    `);
    logger.info("ensureColumns: home_artifacts table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: home_artifacts table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS capacity_pools (
        user_id           INTEGER      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        tier              TEXT         NOT NULL DEFAULT 'explorer',
        monthly_allotment INTEGER      NOT NULL DEFAULT 30,
        daily_allotment   INTEGER,
        used_this_period  INTEGER      NOT NULL DEFAULT 0,
        used_today        INTEGER      NOT NULL DEFAULT 0,
        topup_balance     INTEGER      NOT NULL DEFAULT 0,
        period_start      TIMESTAMPTZ  NOT NULL,
        period_end        TIMESTAMPTZ  NOT NULL,
        day_start         TIMESTAMPTZ  NOT NULL,
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: capacity_pools table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: capacity_pools table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_tier1_memory (
        id serial PRIMARY KEY,
        project_id integer NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        building text NOT NULL DEFAULT '',
        audience text NOT NULL DEFAULT '',
        problem text NOT NULL DEFAULT '',
        out_of_scope text NOT NULL DEFAULT '',
        success_signal text NOT NULL DEFAULT '',
        constraints text NOT NULL DEFAULT '',
        tier1_skipped_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE project_tier1_memory
        ADD COLUMN IF NOT EXISTS tier1_skipped_at timestamptz
    `);
    logger.info("ensureColumns: project_tier1_memory table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_tier1_memory table failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS nexus_conversations (
        conversation_id text PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tier1_buffer jsonb,
        tier1_skipped_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: nexus_conversations table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: nexus_conversations table failed — server will start anyway");
  }

  // Tier 2 — per-project behavioral pattern synthesis
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_tier2_patterns (
        project_id    INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        patterns      TEXT NOT NULL,
        synthesized_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: project_tier2_patterns table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_tier2_patterns failed — server will start anyway");
  }

  // Tier 3 — cross-project behavioral signals (persisted; replaces in-memory patternCache)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_tier3_signals (
        user_id       INTEGER PRIMARY KEY,
        signals       TEXT NOT NULL,
        synthesized_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: user_tier3_signals table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: user_tier3_signals failed — server will start anyway");
  }

  // Tier 4 — portfolio-level intelligence synthesis
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_tier4_portfolio (
        user_id       INTEGER PRIMARY KEY,
        summary       TEXT NOT NULL,
        synthesized_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    logger.info("ensureColumns: user_tier4_portfolio table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: user_tier4_portfolio failed — server will start anyway");
  }

  // F2 Source Intelligence — per-project code index
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_type text NOT NULL,
        source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_primary boolean NOT NULL DEFAULT false,
        last_ingested_at timestamptz,
        last_ingest_status text NOT NULL DEFAULT 'pending',
        last_ingest_error text,
        file_count integer NOT NULL DEFAULT 0,
        total_bytes bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS one_primary_per_project
        ON project_sources (project_id) WHERE is_primary = true
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_sources_project_id_idx ON project_sources (project_id)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_source_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        source_id uuid NOT NULL REFERENCES project_sources(id) ON DELETE CASCADE,
        path text NOT NULL,
        size_bytes integer NOT NULL DEFAULT 0,
        sha256 text NOT NULL,
        language text,
        content text,
        storage_key text,
        exports jsonb NOT NULL DEFAULT '[]'::jsonb,
        imports jsonb NOT NULL DEFAULT '[]'::jsonb,
        indexed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS project_source_files_source_path_uq
        ON project_source_files (source_id, path)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_source_files_source_language_idx
        ON project_source_files (source_id, language)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_source_files_exports_gin
        ON project_source_files USING gin (exports)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_source_files_imports_gin
        ON project_source_files USING gin (imports)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_source_embeddings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        file_id uuid NOT NULL REFERENCES project_source_files(id) ON DELETE CASCADE,
        chunk_index integer NOT NULL,
        line_start integer NOT NULL,
        line_end integer NOT NULL,
        content text NOT NULL,
        embedding vector(1536)
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS project_source_embeddings_file_chunk_uq
        ON project_source_embeddings (file_id, chunk_index)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_source_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        source_id uuid NOT NULL REFERENCES project_sources(id) ON DELETE CASCADE,
        taken_at timestamptz NOT NULL DEFAULT now(),
        file_manifest jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_source_snapshots_source_id_idx
        ON project_source_snapshots (source_id)
    `);
    logger.info("ensureColumns: project_sources tables verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: project_sources tables failed — server will start anyway");
  }

  // ── Phase 1: Run Lifecycle Contract tables ──────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_runs (
        id text PRIMARY KEY,
        project_id integer,
        conversation_id text NOT NULL,
        user_id integer NOT NULL,
        status text NOT NULL DEFAULT 'received',
        intent text NOT NULL,
        prompt text NOT NULL DEFAULT '',
        response text,
        summary text,
        plan jsonb,
        step_count integer NOT NULL DEFAULT 0,
        steps_done integer NOT NULL DEFAULT 0,
        error jsonb,
        verification jsonb,
        commit_state jsonb,
        snapshot_ref text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        elapsed_ms integer
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS contract_runs_conversation_id_idx
        ON contract_runs (conversation_id, created_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS contract_runs_user_id_idx
        ON contract_runs (user_id, created_at DESC)
    `);
    await db.execute(sql`
      ALTER TABLE contract_runs ADD COLUMN IF NOT EXISTS idempotency_key text
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS contract_runs_idempotency_idx
        ON contract_runs (user_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `);
    logger.info("ensureColumns: contract_runs table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: contract_runs failed — server will start anyway");
  }

  // ── v1.3: Run Contract new columns ──────────────────────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE contract_runs
        ADD COLUMN IF NOT EXISTS run_mode           text NOT NULL DEFAULT 'EXPLORE',
        ADD COLUMN IF NOT EXISTS execution_state    text,
        ADD COLUMN IF NOT EXISTS verification_contract jsonb,
        ADD COLUMN IF NOT EXISTS state_history      jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS open_questions     jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    logger.info("ensureColumns: contract_runs v1.3 columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: contract_runs v1.3 columns failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_run_steps (
        id text PRIMARY KEY,
        run_id text NOT NULL REFERENCES contract_runs(id) ON DELETE CASCADE,
        seq integer NOT NULL,
        verb text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        title text NOT NULL DEFAULT '',
        detail text,
        file_path text,
        command text,
        exit_code integer,
        output_summary text,
        artifact jsonb,
        started_at timestamptz,
        completed_at timestamptz
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS contract_run_steps_run_id_idx
        ON contract_run_steps (run_id, seq ASC)
    `);
    logger.info("ensureColumns: contract_run_steps table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: contract_run_steps failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_run_changes (
        id text PRIMARY KEY,
        run_id text NOT NULL REFERENCES contract_runs(id) ON DELETE CASCADE,
        step_id text,
        seq integer NOT NULL DEFAULT 0,
        file_path text NOT NULL,
        verb text NOT NULL,
        before_content text,
        after_content text,
        status text NOT NULL DEFAULT 'pending'
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS contract_run_changes_run_id_idx
        ON contract_run_changes (run_id, seq ASC)
    `);
    logger.info("ensureColumns: contract_run_changes table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: contract_run_changes failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_run_outputs (
        id text PRIMARY KEY,
        run_id text NOT NULL REFERENCES contract_runs(id) ON DELETE CASCADE,
        step_id text,
        name text NOT NULL,
        type text NOT NULL,
        mime_type text NOT NULL DEFAULT 'application/octet-stream',
        size_bytes integer,
        status text NOT NULL DEFAULT 'generating',
        download_url text,
        preview_url text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS contract_run_outputs_run_id_idx
        ON contract_run_outputs (run_id, created_at ASC)
    `);
    logger.info("ensureColumns: contract_run_outputs table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: contract_run_outputs failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_terminal_lines (
        id serial PRIMARY KEY,
        run_id text NOT NULL REFERENCES contract_runs(id) ON DELETE CASCADE,
        step_id text,
        stream text NOT NULL DEFAULT 'stdout',
        text text NOT NULL,
        timestamp timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS contract_terminal_lines_run_id_idx
        ON contract_terminal_lines (run_id, id ASC)
    `);
    logger.info("ensureColumns: contract_terminal_lines table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: contract_terminal_lines failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS conversation_events (
        id serial PRIMARY KEY,
        conversation_id text NOT NULL,
        run_id text NOT NULL,
        event_id text NOT NULL UNIQUE,
        seq integer NOT NULL,
        type text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        timestamp timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS conversation_events_conversation_id_seq_idx
        ON conversation_events (conversation_id, seq ASC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS conversation_events_run_id_idx
        ON conversation_events (run_id, seq ASC)
    `);
    logger.info("ensureColumns: conversation_events table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: conversation_events failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id text PRIMARY KEY,
        run_id text NOT NULL,
        conversation_id text NOT NULL,
        role text NOT NULL,
        content text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS conversation_messages_conversation_id_idx
        ON conversation_messages (conversation_id, created_at ASC)
    `);
    logger.info("ensureColumns: conversation_messages table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: conversation_messages failed — server will start anyway");
  }

  try {
    await db.execute(sql`ALTER TABLE sessions ALTER COLUMN project_id DROP NOT NULL`);
    await db.execute(sql`
      ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id) ON DELETE SET NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS sessions_user_id_idx
        ON sessions (user_id, updated_at DESC)
        WHERE project_id IS NULL
    `);
    logger.info("ensureColumns: sessions nullable project_id + user_id verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: sessions atlas columns failed — server will start anyway");
  }

  // v1.4: Truth-layer columns on execution_runs (consolidated from contract_runs)
  try {
    await db.execute(sql`
      ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS run_mode   text NOT NULL DEFAULT 'EXPLORE',
        ADD COLUMN IF NOT EXISTS execution_state text,
        ADD COLUMN IF NOT EXISTS verification_contract jsonb,
        ADD COLUMN IF NOT EXISTS state_history jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS mode_history jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    logger.info("ensureColumns: execution_runs truth-layer columns (v1.4) verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: execution_runs truth-layer columns failed — server will start anyway");
  }

  // v1.4: step_purpose on execution_run_steps for evidence validation
  try {
    await db.execute(sql`
      ALTER TABLE execution_run_steps
        ADD COLUMN IF NOT EXISTS step_purpose text
    `);
    logger.info("ensureColumns: execution_run_steps.step_purpose (v1.4) verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: execution_run_steps.step_purpose failed — server will start anyway");
  }

  // v1.5: browser flow evidence columns on execution_run_steps
  try {
    await db.execute(sql`
      ALTER TABLE execution_run_steps
        ADD COLUMN IF NOT EXISTS phase         text,
        ADD COLUMN IF NOT EXISTS evidence_ref  text,
        ADD COLUMN IF NOT EXISTS metadata      jsonb
    `);
    logger.info("ensureColumns: execution_run_steps browser-flow columns (v1.5) verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: execution_run_steps browser-flow columns failed — server will start anyway");
  }

  // v1.5: browser_test_sessions — scoped short-lived sessions for run_browser_flow
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS browser_test_sessions (
        token            UUID PRIMARY KEY,
        user_id          INTEGER NOT NULL,
        project_id       INTEGER NOT NULL,
        execution_run_id TEXT    NOT NULL,
        scope            TEXT    NOT NULL DEFAULT 'READ_ONLY',
        allowed_mutations JSONB  NOT NULL DEFAULT '[]'::jsonb,
        expires_at       TIMESTAMPTZ NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("ensureColumns: browser_test_sessions table (v1.5) verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: browser_test_sessions table failed — server will start anyway");
  }

  // Library Foundation — canonical saved items + conversation attachments
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS library_items (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id                 integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id              integer REFERENCES projects(id) ON DELETE CASCADE,
        kind                    text NOT NULL DEFAULT 'document',
        title                   text NOT NULL,
        content                 text,
        preview                 text NOT NULL DEFAULT '',
        origin_source           text NOT NULL DEFAULT 'unknown',
        origin_conversation_id  text,
        origin_message_id       text,
        legacy_source           text,
        legacy_id               text,
        created_at              timestamptz NOT NULL DEFAULT now(),
        updated_at              timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS library_items_user_created_idx
        ON library_items (user_id, created_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS library_items_user_project_idx
        ON library_items (user_id, project_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS library_items_user_kind_idx
        ON library_items (user_id, kind)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS library_items_legacy_uq
        ON library_items (legacy_source, legacy_id)
        WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS conversation_context_items (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        conversation_id       text NOT NULL,
        library_item_id       uuid NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
        attached_by_user_id   integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attached_at           timestamptz NOT NULL DEFAULT now(),
        detached_at           timestamptz
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS conversation_context_items_active_uq
        ON conversation_context_items (conversation_id, library_item_id)
        WHERE detached_at IS NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS conversation_context_items_conversation_idx
        ON conversation_context_items (conversation_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS conversation_context_items_library_item_idx
        ON conversation_context_items (library_item_id)
    `);

    // Idempotent backfill from legacy tables (if present)
    await db.execute(sql`
      DO $bf$
      BEGIN
        IF to_regclass('public.home_artifacts') IS NOT NULL THEN
          INSERT INTO library_items (
            user_id, project_id, kind, title, content, preview,
            origin_source, origin_conversation_id, origin_message_id,
            legacy_source, legacy_id, created_at, updated_at
          )
          SELECT
            ha.user_id, NULL,
            CASE lower(ha.type)
              WHEN 'document' THEN 'document' WHEN 'prd' THEN 'prd'
              WHEN 'plan' THEN 'plan' WHEN 'strategy' THEN 'strategy'
              WHEN 'spec' THEN 'spec' WHEN 'outline' THEN 'outline'
              WHEN 'brief' THEN 'brief' WHEN 'bookmark' THEN 'bookmark'
              WHEN 'sketch' THEN 'sketch' ELSE 'other'
            END,
            ha.title, ha.content, left(coalesce(ha.content, ''), 200),
            'ask-atlas', ha.conversation_id, NULL,
            'home_artifacts', ha.id::text, ha.created_at, coalesce(ha.updated_at, ha.created_at)
          FROM home_artifacts ha
          WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = ha.user_id)
            AND NOT EXISTS (
              SELECT 1 FROM library_items li
              WHERE li.legacy_source = 'home_artifacts' AND li.legacy_id = ha.id::text
            );
        END IF;
        IF to_regclass('public.project_bookmarks') IS NOT NULL THEN
          INSERT INTO library_items (
            user_id, project_id, kind, title, content, preview,
            origin_source, origin_conversation_id, origin_message_id,
            legacy_source, legacy_id, created_at, updated_at
          )
          SELECT
            pb.user_id, pb.project_id, 'bookmark', pb.title, pb.payload_json,
            left(coalesce(nullif(pb.payload_json, ''), pb.title, ''), 200),
            'ask-atlas', NULL, pb.message_id::text,
            'project_bookmarks', pb.id::text, pb.created_at, pb.created_at
          FROM project_bookmarks pb
          WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = pb.user_id)
            AND EXISTS (SELECT 1 FROM projects p WHERE p.id = pb.project_id)
            AND NOT EXISTS (
              SELECT 1 FROM library_items li
              WHERE li.legacy_source = 'project_bookmarks' AND li.legacy_id = pb.id::text
            );
        END IF;
      END
      $bf$
    `);
    logger.info("ensureColumns: library_items + conversation_context_items verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: library_items tables failed — server will start anyway");
  }

  // library_items.artifact_type — added post-initial-schema to preserve raw deliverable type
  try {
    await db.execute(sql`
      ALTER TABLE library_items
        ADD COLUMN IF NOT EXISTS artifact_type text
    `);
    // Backfill existing project_artifacts rows using the FK relationship (no title matching)
    await db.execute(sql`
      UPDATE library_items li
      SET
        artifact_type = pa.type,
        kind = CASE
          WHEN lower(pa.type) IN ('html-app', 'html', 'html_preview', 'mermaid', 'chart') THEN 'sketch'
          WHEN lower(pa.type) IN ('prd') THEN 'prd'
          WHEN lower(pa.type) IN ('plan') THEN 'plan'
          WHEN lower(pa.type) IN ('spec') THEN 'spec'
          WHEN lower(pa.type) IN ('strategy') THEN 'strategy'
          WHEN lower(pa.type) IN ('brief') THEN 'brief'
          WHEN lower(pa.type) IN ('outline') THEN 'outline'
          WHEN lower(pa.type) = 'bookmark' THEN 'bookmark'
          ELSE 'document'
        END
      FROM project_artifacts pa
      WHERE li.legacy_source = 'project_artifacts'
        AND li.legacy_id = pa.id::text
        AND li.artifact_type IS NULL
    `);
    logger.info("ensureColumns: library_items.artifact_type verified + backfilled");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: library_items.artifact_type failed — server will start anyway");
  }

  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS repo_is_public boolean
    `);
    logger.info("ensureColumns: projects.repo_is_public verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: projects.repo_is_public failed — server will start anyway");
  }

  // Attachment lifecycle — persistent chat attachments (see message_attachments schema)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_attachments (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id              integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id           integer REFERENCES projects(id) ON DELETE SET NULL,
        conversation_id      text,
        surface              text,
        chat_message_id      integer,
        nexus_message_id     integer,
        filename             text NOT NULL,
        mime_type            text NOT NULL,
        size_bytes           bigint NOT NULL,
        kind                 text NOT NULL DEFAULT 'other',
        storage_bucket       text NOT NULL,
        storage_path         text NOT NULL,
        upload_status        text NOT NULL DEFAULT 'pending_upload',
        availability_status  text NOT NULL DEFAULT 'active',
        processing_status    text NOT NULL DEFAULT 'pending',
        library_item_id      uuid REFERENCES library_items(id) ON DELETE SET NULL,
        expires_at           timestamptz,
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_attachments_user_id_idx
        ON message_attachments (user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_attachments_conversation_id_idx
        ON message_attachments (conversation_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_attachments_chat_message_id_idx
        ON message_attachments (chat_message_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_attachments_nexus_message_id_idx
        ON message_attachments (nexus_message_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS message_attachments_expires_at_idx
        ON message_attachments (expires_at)
        WHERE availability_status <> 'library'
    `);
    logger.info("ensureColumns: message_attachments table verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments failed — server will start anyway");
  }

  // B3.2 — durable attachment write path: 5 new columns + data migration + constraints.
  // Each ALTER/CREATE is independent so a partial failure does not block the others.

  try {
    await db.execute(sql`
      ALTER TABLE message_attachments
        ADD COLUMN IF NOT EXISTS client_attachment_id  text,
        ADD COLUMN IF NOT EXISTS upload_error_code     text,
        ADD COLUMN IF NOT EXISTS upload_error_message  text,
        ADD COLUMN IF NOT EXISTS upload_attempt_count  integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_upload_attempt_at timestamptz
    `);
    logger.info("ensureColumns: message_attachments B3.2 columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments B3.2 columns failed — server will start anyway");
  }

  try {
    // Idempotency guard: unique per message + client id (partial — NULL client ids excluded).
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS message_attachments_nexus_msg_client_id_uq
        ON message_attachments (nexus_message_id, client_attachment_id)
        WHERE client_attachment_id IS NOT NULL
          AND nexus_message_id IS NOT NULL
    `);
    logger.info("ensureColumns: message_attachments nexus_message+client_id unique index verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments nexus_msg_client_id_uq failed — server will start anyway");
  }

  try {
    // Prevent duplicate (bucket, path) pairs.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS message_attachments_bucket_path_uq
        ON message_attachments (storage_bucket, storage_path)
    `);
    logger.info("ensureColumns: message_attachments bucket+path unique index verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments bucket_path_uq failed — server will start anyway");
  }

  try {
    // Data migration: delete orphaned rows with no Nexus parent.
    // Pending uploads legitimately have nexus_message_id IS NULL until finalize()
    // links them. Do not delete them on boot — the retention worker handles cleanup
    // of expired/orphaned rows after their TTL.
    logger.info("ensureColumns: message_attachments null-nexus-parent cleanup skipped (handled by retention worker)");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments setup failed — non-fatal");
  }

  try {
    // 'chat-attachments' is the active local fallback bucket (LOGICAL_BUCKET in
    // attachmentStorage.ts). Do not mark these rows as failed.
    logger.info("ensureColumns: message_attachments bucket check skipped (chat-attachments is the active bucket)");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments bucket check failed — non-fatal");
  }

  // B3.2 ordering — deterministic multi-attachment position field.
  try {
    await db.execute(sql`
      ALTER TABLE message_attachments
        ADD COLUMN IF NOT EXISTS message_position integer
    `);
    logger.info("ensureColumns: message_attachments.message_position column verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments.message_position column failed — server will start anyway");
  }

  try {
    // Partial unique index: only covers rows where both nexus_message_id and
    // message_position are set (excludes pre-B3.2 rows where position is NULL).
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS message_attachments_nexus_msg_pos_uq
        ON message_attachments (nexus_message_id, message_position)
        WHERE nexus_message_id IS NOT NULL
          AND message_position IS NOT NULL
    `);
    logger.info("ensureColumns: message_attachments nexus_message+position unique index verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments nexus_msg_pos_uq failed — server will start anyway");
  }

  try {
    // Add FK with CASCADE so attachment rows are removed when the message is deleted.
    // Uses DO NOTHING on constraint-already-exists (pg throws 42710 if re-added).
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'message_attachments_nexus_message_id_fk'
        ) THEN
          ALTER TABLE message_attachments
            ADD CONSTRAINT message_attachments_nexus_message_id_fk
            FOREIGN KEY (nexus_message_id)
            REFERENCES nexus_messages(id)
            ON DELETE CASCADE;
        END IF;
      END;
      $$
    `);
    logger.info("ensureColumns: message_attachments nexus_message_id FK verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: message_attachments nexus_message_id FK failed — non-fatal");
  }
}

async function runMigrations(): Promise<void> {
  try {
    await migrate(db, { migrationsFolder: "../../lib/db/migrations" });
    logger.info("Boot migrate: applied cleanly (fresh/empty database).");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const causeMessage = (err instanceof Error && (err as any).cause instanceof Error)
      ? (err as any).cause.message as string
      : "";
    const pgCode = (err as any)?.cause?.code ?? (err as any)?.code ?? "";
    const isDuplicateTable =
      message.includes("already exists") ||
      causeMessage.includes("already exists") ||
      pgCode === "42P07";
    const isNoMigrationsFolder =
      message.includes("_journal.json") ||
      message.includes("meta") ||
      message.includes("ENOENT");
    if (isDuplicateTable) {
      logger.warn("Boot migrate: skipped — schema is managed by drizzle-kit push, not migration files. Expected on the live database; not an error.");
    } else if (isNoMigrationsFolder) {
      logger.warn("Boot migrate: skipped — no migrations folder found. Schema is managed by drizzle-kit push.");
    } else {
      // Non-fatal in production — log and continue rather than killing the process
      logger.error({ err }, "Migration failed — server starting anyway");
    }
  }
}

async function backgroundInit(): Promise<void> {
  // Fire and forget — never block port binding
  initStripe().catch((err) => {
    console.warn("Stripe init skipped:", err?.message ?? err);
  });

  // Sync schema. Never block on failure.
  await pushSchema().catch((err) => {
    logger.warn({ err }, "Schema push threw — server will continue anyway");
  });

  // Belt-and-suspenders: ensure columns drizzle-kit push may have skipped
  await ensureColumns();

  // Apply any migration files (no-ops on live DB managed by drizzle-kit push)
  await runMigrations();

  // Seeds — all fire-and-forget
  seedMissingGenomes().catch((err) => {
    logger.warn({ err }, "genome seed on startup failed — non-fatal");
  });

  seedMissingSessionsForCommitted().catch((err) => {
    logger.warn({ err }, "session seed on startup failed — non-fatal");
  });

  backfillEmptyGenomes().catch((err) => {
    logger.warn({ err }, "genome backfill on startup failed — non-fatal");
  });

  seedMissingApplicationModels().catch((err) => {
    logger.warn({ err }, "application model seed on startup failed — non-fatal");
  });

  migrateGenomeToApplicationModel().catch((err) => {
    logger.warn({ err }, "genome→AM migration on startup failed — non-fatal");
  });

  db.execute(sql`
    UPDATE entries
    SET am_field = 'intent'
    WHERE type = 'Decision'
      AND status = 'committed'
      AND am_field IS NULL
  `).then(({ rowCount }) => {
    if ((rowCount ?? 0) > 0) {
      logger.info({ count: rowCount }, "ledger→AM backfill: tagged entries with am_field=intent");
    }
  }).catch((err) => {
    logger.warn({ err }, "ledger→AM backfill failed — non-fatal");
  });

  // User identity profile — durable per-user personality, name, and work-style synthesis.
  // Separate from global_narrative (working context) — this captures WHO the person is,
  // not what they've been working on recently.
  db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS user_identity text
  `).catch((err) => {
    logger.warn({ err }, "ensureColumns: users.user_identity failed — non-fatal");
  });
}

async function main() {
  // Bind to the port FIRST so Replit's port-detection timeout never fires.
  // All slow work (schema push, migrations, seeds) runs in backgroundInit
  // which is launched from the listen callback after the port is already open.
  const httpServer = app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Server listening");
    if (process.send) process.send("ready");
    startScheduledChecksWorker();
    startCapacityResetWorker();
    startAttachmentRetentionWorker();

    backgroundInit().catch((err) => {
      logger.error({ err }, "backgroundInit failed — server still running");
    });
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    logger.fatal({ err, port }, "Failed to bind port — process will exit");
    process.exit(1);
  });
}

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise: String(promise) }, "Unhandled promise rejection — this is a bug");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — process will exit");
  process.exit(1);
});

main();
