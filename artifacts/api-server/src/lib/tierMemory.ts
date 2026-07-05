/**
 * Tier Memory System — Tiers 2–5
 *
 * Tier 1: per-project foundation (project_tier1_memory) — built separately in services/tier1.ts
 * Tier 2: per-project patterns  (project_tier2_patterns) — temporal intelligence within a project
 * Tier 3: cross-project signals (user_tier3_signals)     — patterns across all user projects
 * Tier 4: portfolio intelligence(user_tier4_portfolio)   — synthesized portfolio narrative
 * Tier 5: global narrative      (users.global_narrative) — handled by thinkingReceiptExtract.ts
 *         This file adds a workspace-side trigger for Tier 5 so it also fires from chat turns.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { synthesizeGlobalNarrative } from "./thinkingReceiptExtract";

const anthropic = new Anthropic();

// ── Tier 2 — Project Patterns ─────────────────────────────────────────────────
// What has changed, repeated, or stalled inside THIS project over time?

const TIER2_COOLDOWN_MS = 5 * 60 * 1000;

export async function synthesizeTier2Patterns(projectId: number, userId: number): Promise<void> {
  void userId;
  try {
    const existing = await db.execute(sql`
      SELECT synthesized_at FROM project_tier2_patterns WHERE project_id = ${projectId}
    `).then(r => ((r.rows ?? r)[0] as { synthesized_at: string | null } | undefined) ?? null)
      .catch(() => null);

    if (existing?.synthesized_at) {
      const age = Date.now() - new Date(existing.synthesized_at).getTime();
      if (age < TIER2_COOLDOWN_MS) return;
    }

    const [tier1Row, genomeRow, recentEntries, msgCountRow] = await Promise.all([
      db.execute(sql`
        SELECT building, audience, problem, out_of_scope, success_signal, constraints
        FROM project_tier1_memory WHERE project_id = ${projectId} LIMIT 1
      `).then(r => ((r.rows ?? r)[0] as Record<string, string | null> | undefined) ?? null)
        .catch(() => null),

      db.execute(sql`
        SELECT purpose, stage, constraints, open_questions, confidence_score
        FROM project_genome WHERE project_id = ${projectId} LIMIT 1
      `).then(r => ((r.rows ?? r)[0] as Record<string, unknown> | undefined) ?? null)
        .catch(() => null),

      db.execute(sql`
        SELECT type, title, status, created_at
        FROM entries WHERE project_id = ${projectId} AND status != 'archived'
        ORDER BY created_at DESC LIMIT 40
      `).then(r => (r.rows ?? r) as Array<Record<string, unknown>>)
        .catch(() => [] as Array<Record<string, unknown>>),

      db.execute(sql`
        SELECT COUNT(*) as n FROM nexus_messages
        WHERE project_id = ${projectId}
          AND message_type IS DISTINCT FROM 'briefing'
          AND created_at >= NOW() - INTERVAL '14 days'
      `).then(r => ((r.rows ?? r)[0] as { n: string | number } | undefined) ?? null)
        .catch(() => null),
    ]);

    const msgCount = Number(msgCountRow?.n ?? 0);
    const blockers = recentEntries.filter(e => e.type === "Blocker");
    const committed = recentEntries.filter(e => e.type === "Decision" && e.status === "committed");

    const entrySummary = recentEntries.slice(0, 20)
      .map(e => `[${e.type}/${e.status}] ${e.title}`)
      .join("\n");

    const context = [
      tier1Row?.building ? `Building: ${tier1Row.building}` : "",
      genomeRow?.stage ? `Stage: ${genomeRow.stage}` : "",
      genomeRow?.confidence_score != null ? `Clarity: ${genomeRow.confidence_score}/100` : "",
      `Blockers: ${blockers.length} open`,
      `Committed decisions: ${committed.length}`,
      `Messages last 14d: ${msgCount}`,
      entrySummary ? `Recent entries:\n${entrySummary}` : "",
    ].filter(Boolean).join("\n");

    if (!context.trim()) return;

    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 280,
      system: `You identify 1-3 honest behavioral patterns WITHIN a single project over time.
Look at: repeated themes, unresolved blockers, stage velocity, commit/park ratio, recurring topics.
Each pattern on its own line starting with "·". Be specific. No generic encouragement.
If nothing meaningful: respond with exactly: none`,
      messages: [{ role: "user", content: context }],
    });

    const text = ((resp.content[0] as { type: string; text?: string })?.text ?? "").trim();
    if (!text || text.toLowerCase() === "none") return;

    await db.execute(sql`
      INSERT INTO project_tier2_patterns (project_id, patterns, synthesized_at)
      VALUES (${projectId}, ${text}, now())
      ON CONFLICT (project_id) DO UPDATE
        SET patterns = EXCLUDED.patterns, synthesized_at = now()
    `);
  } catch {
    /* non-fatal */
  }
}

export async function loadTier2Block(projectId: number): Promise<string | null> {
  try {
    const row = await db.execute(sql`
      SELECT patterns FROM project_tier2_patterns WHERE project_id = ${projectId}
    `).then(r => ((r.rows ?? r)[0] as { patterns: string | null } | undefined) ?? null);
    return row?.patterns ?? null;
  } catch { return null; }
}

// ── Tier 3 — Cross-Project Signals ────────────────────────────────────────────
// Patterns that emerge ACROSS all of a user's projects — who they are as a builder.

const TIER3_COOLDOWN_MS = 15 * 60 * 1000;

export async function synthesizeTier3Signals(userId: number): Promise<void> {
  try {
    const existing = await db.execute(sql`
      SELECT synthesized_at FROM user_tier3_signals WHERE user_id = ${userId}
    `).then(r => ((r.rows ?? r)[0] as { synthesized_at: string | null } | undefined) ?? null)
      .catch(() => null);

    if (existing?.synthesized_at) {
      const age = Date.now() - new Date(existing.synthesized_at).getTime();
      if (age < TIER3_COOLDOWN_MS) return;
    }

    const [projects, allTier1, entryStats] = await Promise.all([
      db.execute(sql`
        SELECT id, name, status FROM projects WHERE user_id = ${userId}
        ORDER BY updated_at DESC LIMIT 10
      `).then(r => (r.rows ?? r) as Array<{ id: number; name: string; status: string }>)
        .catch(() => [] as Array<{ id: number; name: string; status: string }>),

      db.execute(sql`
        SELECT t.project_id, t.building, t.audience, t.problem, t.constraints, t.success_signal
        FROM project_tier1_memory t
        JOIN projects p ON p.id = t.project_id
        WHERE p.user_id = ${userId}
      `).then(r => (r.rows ?? r) as Array<Record<string, string | number | null>>)
        .catch(() => [] as Array<Record<string, string | number | null>>),

      db.execute(sql`
        SELECT e.project_id, e.type, COUNT(*) as n
        FROM entries e
        JOIN projects p ON p.id = e.project_id
        WHERE p.user_id = ${userId} AND e.status != 'archived'
        GROUP BY e.project_id, e.type
      `).then(r => (r.rows ?? r) as Array<{ project_id: number; type: string; n: string }>)
        .catch(() => [] as Array<{ project_id: number; type: string; n: string }>),
    ]);

    if (projects.length < 2) return;

    const tier1Map = new Map(allTier1.map(t => [Number(t.project_id), t]));
    const statMap = new Map<number, Record<string, number>>();
    for (const stat of entryStats) {
      const pid = Number(stat.project_id);
      if (!statMap.has(pid)) statMap.set(pid, {});
      statMap.get(pid)![stat.type] = Number(stat.n);
    }

    const summaries = projects.map(p => {
      const t1 = tier1Map.get(p.id);
      const stats = statMap.get(p.id) ?? {};
      const decided = stats["Decision"] ?? 0;
      const blocked = stats["Blocker"] ?? 0;
      return [
        `${p.name} (${p.status}):`,
        t1?.building ? `  Building: ${t1.building}` : "",
        t1?.audience ? `  For: ${t1.audience}` : "",
        t1?.constraints ? `  Constraints: ${t1.constraints}` : "",
        `  ${decided} committed decisions, ${blocked} open blockers`,
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 280,
      system: `You identify 2-4 behavioral patterns ACROSS a user's multiple projects.
Focus on HOW they work as a builder — not what they're building.
Examples: where decisions stall, what they always/never do, recurring constraints, stage patterns.
Each pattern on its own line starting with "·". Be honest and specific.
If nothing meaningful across projects: respond with exactly: none`,
      messages: [{ role: "user", content: summaries }],
    });

    const text = ((resp.content[0] as { type: string; text?: string })?.text ?? "").trim();
    if (!text || text.toLowerCase() === "none") return;

    await db.execute(sql`
      INSERT INTO user_tier3_signals (user_id, signals, synthesized_at)
      VALUES (${userId}, ${text}, now())
      ON CONFLICT (user_id) DO UPDATE
        SET signals = EXCLUDED.signals, synthesized_at = now()
    `);
  } catch {
    /* non-fatal */
  }
}

export async function loadTier3Block(userId: number): Promise<string | null> {
  try {
    const row = await db.execute(sql`
      SELECT signals FROM user_tier3_signals WHERE user_id = ${userId}
    `).then(r => ((r.rows ?? r)[0] as { signals: string | null } | undefined) ?? null);
    return row?.signals ?? null;
  } catch { return null; }
}

// ── Tier 4 — Portfolio Intelligence ──────────────────────────────────────────
// High-level synthesis of the user's full portfolio — health, composition, momentum.

const TIER4_COOLDOWN_MS = 30 * 60 * 1000;

export async function synthesizeTier4Portfolio(userId: number): Promise<void> {
  try {
    const existing = await db.execute(sql`
      SELECT synthesized_at FROM user_tier4_portfolio WHERE user_id = ${userId}
    `).then(r => ((r.rows ?? r)[0] as { synthesized_at: string | null } | undefined) ?? null)
      .catch(() => null);

    if (existing?.synthesized_at) {
      const age = Date.now() - new Date(existing.synthesized_at).getTime();
      if (age < TIER4_COOLDOWN_MS) return;
    }

    const [projects, msgStats] = await Promise.all([
      db.execute(sql`
        SELECT id, name, status, description FROM projects WHERE user_id = ${userId}
        ORDER BY updated_at DESC LIMIT 15
      `).then(r => (r.rows ?? r) as Array<{ id: number; name: string; status: string; description: string | null }>)
        .catch(() => [] as Array<{ id: number; name: string; status: string; description: string | null }>),

      db.execute(sql`
        SELECT nm.project_id, COUNT(*) as n
        FROM nexus_messages nm
        JOIN projects p ON p.id = nm.project_id
        WHERE p.user_id = ${userId}
          AND nm.created_at >= NOW() - INTERVAL '30 days'
          AND nm.message_type IS DISTINCT FROM 'briefing'
        GROUP BY nm.project_id
      `).then(r => (r.rows ?? r) as Array<{ project_id: number; n: string }>)
        .catch(() => [] as Array<{ project_id: number; n: string }>),
    ]);

    if (projects.length === 0) return;

    const msgMap = new Map(msgStats.map(m => [Number(m.project_id), Number(m.n)]));
    const activeProjects = projects.filter(p => p.status !== "archived");

    const summary = projects.map(p => {
      const msgs = msgMap.get(p.id) ?? 0;
      return `${p.name} (${p.status}): ${msgs} messages last 30d`;
    }).join("\n");

    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 180,
      system: `Summarize this user's project portfolio in 1-2 honest sentences.
Cover: overall portfolio health, which projects have momentum vs. are stalled, portfolio breadth or focus.
Plain sentences only — no bullets, no headers. Be honest, not encouraging.
If the portfolio is sparse or only 1 project, just note the current momentum.
If nothing meaningful: respond with exactly: none`,
      messages: [{ role: "user", content: `${activeProjects.length} active projects:\n${summary}` }],
    });

    const text = ((resp.content[0] as { type: string; text?: string })?.text ?? "").trim();
    if (!text || text.toLowerCase() === "none") return;

    await db.execute(sql`
      INSERT INTO user_tier4_portfolio (user_id, summary, synthesized_at)
      VALUES (${userId}, ${text}, now())
      ON CONFLICT (user_id) DO UPDATE
        SET summary = EXCLUDED.summary, synthesized_at = now()
    `);
  } catch {
    /* non-fatal */
  }
}

export async function loadTier4Block(userId: number): Promise<string | null> {
  try {
    const row = await db.execute(sql`
      SELECT summary FROM user_tier4_portfolio WHERE user_id = ${userId}
    `).then(r => ((r.rows ?? r)[0] as { summary: string | null } | undefined) ?? null);
    return row?.summary ?? null;
  } catch { return null; }
}

// ── Tier 5 — Global Narrative workspace trigger ───────────────────────────────
// Global narrative is owned by thinkingReceiptExtract.ts; we re-export here so
// chat.ts can fire it from workspace turns using the same interface.
export { synthesizeGlobalNarrative };
