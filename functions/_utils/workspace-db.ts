import type { Env } from "./helpers";

export type WatchlistRow = {
  id: string;
  name: string;
  query: string;
  category: string;
  frequency: string;
  created_at: number;
  last_aggregated_at: number | null;
};

export type WatchlistOpType = "add" | "delete" | "touch";

export function getDb(env: Env) {
  const db = env.DB;
  if (!db) throw new Error("ワークスペースDB(D1)が未設定です。wrangler.toml の D1 バインディングを確認してください。");
  return db;
}

export function rowToWatchlistItem(row: WatchlistRow) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    category: row.category,
    frequency: row.frequency as "weekly",
    createdAt: row.created_at,
    lastAggregatedAt: row.last_aggregated_at ?? undefined,
  };
}

export async function listWatchlist(env: Env) {
  const db = getDb(env);
  const { results } = await db
    .prepare("SELECT * FROM watchlist ORDER BY created_at DESC")
    .all<WatchlistRow>();
  return (results || []).map(rowToWatchlistItem);
}

export async function listReports(env: Env, limit = 400) {
  const db = getDb(env);
  const { results } = await db
    .prepare("SELECT * FROM reports ORDER BY run_at DESC LIMIT ?")
    .bind(limit)
    .all<{
      id: string;
      watchlist_id: string;
      watchlist_name: string;
      category: string;
      frequency: string;
      run_at: number;
      prices_json: string;
    }>();
  return (results || []).map((row) => ({
    id: row.id,
    watchlistId: row.watchlist_id,
    watchlistName: row.watchlist_name,
    category: row.category,
    frequency: row.frequency as "weekly",
    runAt: row.run_at,
    prices: JSON.parse(row.prices_json),
  }));
}

async function applyWatchlistOp(
  db: D1Database,
  opType: WatchlistOpType,
  payload: Record<string, unknown>,
) {
  if (opType === "add") {
    const item = payload.item as {
      id: string;
      name: string;
      query: string;
      category: string;
      frequency: string;
      createdAt: number;
    };
    await db
      .prepare(
        `INSERT INTO watchlist (id, name, query, category, frequency, created_at, last_aggregated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(item.id, item.name, item.query, item.category, item.frequency, item.createdAt)
      .run();
    return;
  }

  if (opType === "delete") {
    const id = String(payload.id || "");
    if (!id) throw new Error("delete には id が必要です");
    await db.prepare("DELETE FROM watchlist WHERE id = ?").bind(id).run();
    return;
  }

  if (opType === "touch") {
    const id = String(payload.id || "");
    const lastAggregatedAt = Number(payload.lastAggregatedAt || Date.now());
    if (!id) throw new Error("touch には id が必要です");
    await db
      .prepare("UPDATE watchlist SET last_aggregated_at = ? WHERE id = ?")
      .bind(lastAggregatedAt, id)
      .run();
    return;
  }

  throw new Error(`未対応の操作: ${opType}`);
}

export async function processWatchlistQueue(env: Env, maxOps = 50) {
  const db = getDb(env);
  let processed = 0;

  for (let i = 0; i < maxOps; i++) {
    const next = await db
      .prepare(
        `SELECT id, op_type, payload_json FROM watchlist_ops
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .first<{ id: string; op_type: WatchlistOpType; payload_json: string }>();

    if (!next) break;

    await db.prepare("UPDATE watchlist_ops SET status = 'processing' WHERE id = ?").bind(next.id).run();

    try {
      const payload = JSON.parse(next.payload_json) as Record<string, unknown>;
      await applyWatchlistOp(db, next.op_type, payload);
      await db
        .prepare("UPDATE watchlist_ops SET status = 'done', processed_at = ?, error = NULL WHERE id = ?")
        .bind(Date.now(), next.id)
        .run();
      processed += 1;
    } catch (e) {
      await db
        .prepare("UPDATE watchlist_ops SET status = 'failed', processed_at = ?, error = ? WHERE id = ?")
        .bind(Date.now(), String((e as Error)?.message || e), next.id)
        .run();
      throw e;
    }
  }

  return processed;
}

export async function enqueueWatchlistOp(
  env: Env,
  opType: WatchlistOpType,
  payload: Record<string, unknown>,
) {
  const db = getDb(env);
  const opId = crypto.randomUUID();
  const createdAt = Date.now();

  await db
    .prepare(
      `INSERT INTO watchlist_ops (id, op_type, payload_json, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .bind(opId, opType, JSON.stringify(payload), createdAt)
    .run();

  await processWatchlistQueue(env);

  const op = await db
    .prepare("SELECT status, error FROM watchlist_ops WHERE id = ?")
    .bind(opId)
    .first<{ status: string; error: string | null }>();

  if (op?.status === "failed") {
    throw new Error(op.error || "リスト操作に失敗しました");
  }

  return { opId, status: op?.status || "done", watchlist: await listWatchlist(env) };
}

export async function saveReportRecord(
  env: Env,
  report: {
    id: string;
    watchlistId: string;
    watchlistName: string;
    category: string;
    frequency: string;
    runAt: number;
    prices: unknown;
  },
) {
  const db = getDb(env);
  await db
    .prepare(
      `INSERT INTO reports (id, watchlist_id, watchlist_name, category, frequency, run_at, prices_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      report.id,
      report.watchlistId,
      report.watchlistName,
      report.category,
      report.frequency,
      report.runAt,
      JSON.stringify(report.prices),
    )
    .run();

  const keys = await db.prepare("SELECT id FROM reports ORDER BY run_at ASC").all<{ id: string }>();
  const all = keys.results || [];
  if (all.length > 300) {
    const remove = all.slice(0, all.length - 300);
    await Promise.all(remove.map((row) => db.prepare("DELETE FROM reports WHERE id = ?").bind(row.id).run()));
  }
}
