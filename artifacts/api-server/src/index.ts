import app from "./app";
import { db, pool } from "@workspace/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "./lib/logger";
import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { startScheduledChecksWorker } from "./lib/scheduledChecksWorker";
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
        ADD COLUMN IF NOT EXISTS am_field text
    `);
    logger.info("ensureColumns: entries.am_field column verified");
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
        ADD COLUMN IF NOT EXISTS line_patches_json text
    `);
    logger.info("ensureColumns: chat_messages run-card columns verified");
  } catch (err) {
    logger.warn({ err }, "ensureColumns: chat_messages run-card columns failed — server will start anyway");
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
}

async function main() {
  // Bind to the port FIRST so Replit's port-detection timeout never fires.
  // All slow work (schema push, migrations, seeds) runs in backgroundInit
  // which is launched from the listen callback after the port is already open.
  const httpServer = app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Server listening");
    if (process.send) process.send("ready");
    startScheduledChecksWorker();

    backgroundInit().catch((err) => {
      logger.error({ err }, "backgroundInit failed — server still running");
    });
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    logger.fatal({ err, port }, "Failed to bind port — process will exit");
    process.exit(1);
  });
}

main();
