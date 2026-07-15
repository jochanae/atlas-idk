/**
 * Library parity check — for every legacy home_artifacts / project_bookmarks
 * row, assert a matching library_items row exists with same title/content
 * and correct provenance.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/scripts library:parity
 *   DATABASE_URL=... pnpm --filter @workspace/scripts library:parity -- --user-id=123
 */
import pg from "pg";

const { Client } = pg;

type Mismatch = {
  source: "home_artifacts" | "project_bookmarks";
  legacyId: string;
  reason: string;
};

function parseArgs(argv: string[]): { userId: number | null } {
  let userId: number | null = null;
  for (const arg of argv) {
    const m = /^--user-id=(\d+)$/.exec(arg);
    if (m) userId = Number(m[1]);
  }
  return { userId };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const { userId } = parseArgs(process.argv.slice(2));
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const mismatches: Mismatch[] = [];
  let homeChecked = 0;
  let bookmarkChecked = 0;

  try {
    const homeExists = await client.query(
      `SELECT to_regclass('public.home_artifacts') IS NOT NULL AS ok`,
    );
    const bookmarksExist = await client.query(
      `SELECT to_regclass('public.project_bookmarks') IS NOT NULL AS ok`,
    );
    const libraryExists = await client.query(
      `SELECT to_regclass('public.library_items') IS NOT NULL AS ok`,
    );

    if (!libraryExists.rows[0]?.ok) {
      console.error("library_items table missing — run migrations / ensureColumns first");
      process.exit(1);
    }

    if (homeExists.rows[0]?.ok) {
      const home = await client.query<{
        id: number;
        user_id: number;
        title: string;
        content: string;
        conversation_id: string | null;
        type: string;
      }>(
        userId != null
          ? `SELECT id, user_id, title, content, conversation_id, type FROM home_artifacts WHERE user_id = $1 ORDER BY id`
          : `SELECT id, user_id, title, content, conversation_id, type FROM home_artifacts ORDER BY id`,
        userId != null ? [userId] : [],
      );

      for (const row of home.rows) {
        homeChecked += 1;
        const match = await client.query<{
          id: string;
          title: string;
          content: string | null;
          origin_source: string;
          project_id: number | null;
          legacy_source: string | null;
        }>(
          `SELECT id, title, content, origin_source, project_id, legacy_source
           FROM library_items
           WHERE legacy_source = 'home_artifacts' AND legacy_id = $1`,
          [String(row.id)],
        );

        if (!match.rows.length) {
          mismatches.push({
            source: "home_artifacts",
            legacyId: String(row.id),
            reason: "missing library_items row",
          });
          continue;
        }
        const li = match.rows[0]!;
        if (li.title !== row.title) {
          mismatches.push({
            source: "home_artifacts",
            legacyId: String(row.id),
            reason: `title mismatch: legacy=${JSON.stringify(row.title)} library=${JSON.stringify(li.title)}`,
          });
        }
        if ((li.content ?? "") !== (row.content ?? "")) {
          mismatches.push({
            source: "home_artifacts",
            legacyId: String(row.id),
            reason: "content mismatch",
          });
        }
        if (li.origin_source !== "ask-atlas") {
          mismatches.push({
            source: "home_artifacts",
            legacyId: String(row.id),
            reason: `origin_source expected ask-atlas, got ${li.origin_source}`,
          });
        }
        if (li.project_id != null) {
          mismatches.push({
            source: "home_artifacts",
            legacyId: String(row.id),
            reason: `project_id expected null, got ${li.project_id}`,
          });
        }
      }
    } else {
      console.warn("home_artifacts table absent — skipping home parity");
    }

    if (bookmarksExist.rows[0]?.ok) {
      const bookmarks = await client.query<{
        id: number;
        user_id: number;
        project_id: number;
        title: string;
        payload_json: string | null;
        message_id: number | null;
      }>(
        userId != null
          ? `SELECT id, user_id, project_id, title, payload_json, message_id FROM project_bookmarks WHERE user_id = $1 ORDER BY id`
          : `SELECT id, user_id, project_id, title, payload_json, message_id FROM project_bookmarks ORDER BY id`,
        userId != null ? [userId] : [],
      );

      for (const row of bookmarks.rows) {
        bookmarkChecked += 1;
        const match = await client.query<{
          id: string;
          title: string;
          content: string | null;
          kind: string;
          origin_source: string;
          project_id: number | null;
          origin_message_id: string | null;
        }>(
          `SELECT id, title, content, kind, origin_source, project_id, origin_message_id
           FROM library_items
           WHERE legacy_source = 'project_bookmarks' AND legacy_id = $1`,
          [String(row.id)],
        );

        if (!match.rows.length) {
          mismatches.push({
            source: "project_bookmarks",
            legacyId: String(row.id),
            reason: "missing library_items row",
          });
          continue;
        }
        const li = match.rows[0]!;
        if (li.kind !== "bookmark") {
          mismatches.push({
            source: "project_bookmarks",
            legacyId: String(row.id),
            reason: `kind expected bookmark, got ${li.kind}`,
          });
        }
        if (li.title !== row.title) {
          mismatches.push({
            source: "project_bookmarks",
            legacyId: String(row.id),
            reason: `title mismatch`,
          });
        }
        if ((li.content ?? "") !== (row.payload_json ?? "")) {
          mismatches.push({
            source: "project_bookmarks",
            legacyId: String(row.id),
            reason: "content/payload mismatch",
          });
        }
        if (li.project_id !== row.project_id) {
          mismatches.push({
            source: "project_bookmarks",
            legacyId: String(row.id),
            reason: `project_id mismatch: legacy=${row.project_id} library=${li.project_id}`,
          });
        }
        if (li.origin_source !== "ask-atlas") {
          mismatches.push({
            source: "project_bookmarks",
            legacyId: String(row.id),
            reason: `origin_source expected ask-atlas, got ${li.origin_source}`,
          });
        }
        const expectedMsg = row.message_id != null ? String(row.message_id) : null;
        if ((li.origin_message_id ?? null) !== expectedMsg) {
          mismatches.push({
            source: "project_bookmarks",
            legacyId: String(row.id),
            reason: `origin_message_id mismatch`,
          });
        }
      }
    } else {
      console.warn("project_bookmarks table absent — skipping bookmark parity");
    }
  } finally {
    await client.end();
  }

  console.log(
    JSON.stringify(
      {
        ok: mismatches.length === 0,
        homeChecked,
        bookmarkChecked,
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, 50),
        truncated: mismatches.length > 50,
      },
      null,
      2,
    ),
  );

  process.exit(mismatches.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
