import type { Env } from "./helpers";
import { getDb } from "./workspace-db";
import { normalizeQueryText } from "./price-matching";

export type SoldCondition = "like_new" | "good" | "fair" | "junk" | "unknown";

/** 収集ワーカー(レイヤーB)が /api/ingest に投げる1件分。 */
export interface SoldStatInput {
  /** 明示指定があれば優先。無ければ jan → 正規化クエリ から生成 */
  matchKey?: string;
  query: string;
  jan?: string | null;
  /** 未指定ならバッチの source を使う */
  source?: string;
  condition?: SoldCondition | string;
  currency?: string;
  soldMin?: number | null;
  soldMedian?: number | null;
  soldAvg?: number | null;
  soldMax?: number | null;
  sampleSize?: number | null;
  soldCount7d?: number | null;
  activeCount?: number | null;
  windowDays?: number | null;
  /** 収集時刻(ms epoch)。必須 */
  collectedAt: number;
  raw?: unknown;
}

export interface SoldStat {
  id: string;
  matchKey: string;
  query: string;
  jan: string | null;
  source: string;
  condition: string;
  currency: string;
  soldMin: number | null;
  soldMedian: number | null;
  soldAvg: number | null;
  soldMax: number | null;
  sampleSize: number;
  soldCount7d: number | null;
  activeCount: number | null;
  windowDays: number | null;
  collectedAt: number;
}

export interface IngestBatch {
  source: string;
  batchKey?: string;
  items: SoldStatInput[];
}

export interface IngestResult {
  status: "done" | "duplicate";
  accepted: number;
  skipped: number;
  duplicateBatch?: boolean;
}

type SoldStatRow = {
  id: string;
  match_key: string;
  query: string;
  jan: string | null;
  source: string;
  condition: string;
  currency: string;
  sold_min: number | null;
  sold_median: number | null;
  sold_avg: number | null;
  sold_max: number | null;
  sample_size: number;
  sold_count_7d: number | null;
  active_count: number | null;
  window_days: number | null;
  collected_at: number;
};

const VALID_CONDITIONS = new Set<string>(["like_new", "good", "fair", "junk", "unknown"]);
const MAX_ITEMS_PER_BATCH = 1000;
/** match_key ごとに保持するスナップショット上限（時系列） */
const RETAIN_PER_KEY = 200;

/** JAN優先、無ければ price-matching と同じ正規化で名寄せキーを作る。 */
export function resolveMatchKey(input: { matchKey?: string; jan?: string | null; query: string }): string {
  const explicit = input.matchKey?.trim();
  if (explicit) return explicit;
  const jan = (input.jan || "").replace(/[^0-9]/g, "");
  if (jan.length >= 8) return `jan:${jan}`;
  const norm = normalizeQueryText(input.query || "").replace(/\s+/g, " ").trim();
  return `q:${norm}`;
}

export function normalizeCondition(condition?: string): string {
  const c = (condition || "").trim();
  return VALID_CONDITIONS.has(c) ? c : "unknown";
}

function toInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

function rowToSoldStat(row: SoldStatRow): SoldStat {
  return {
    id: row.id,
    matchKey: row.match_key,
    query: row.query,
    jan: row.jan,
    source: row.source,
    condition: row.condition,
    currency: row.currency,
    soldMin: row.sold_min,
    soldMedian: row.sold_median,
    soldAvg: row.sold_avg,
    soldMax: row.sold_max,
    sampleSize: row.sample_size,
    soldCount7d: row.sold_count_7d,
    activeCount: row.active_count,
    windowDays: row.window_days,
    collectedAt: row.collected_at,
  };
}

/**
 * 収集バッチを sold_stats に取り込む。
 * - バッチ冪等: 同じ batch_key が既に done なら二重取込しない
 * - 行冪等: (match_key, source, condition, collected_at) が既存なら INSERT OR IGNORE でスキップ
 * - 取込のたびに ingest_ops へ監査痕を残す（watchlist_ops と同型）
 */
export async function ingestSoldStats(env: Env, batch: IngestBatch): Promise<IngestResult> {
  const db = getDb(env);
  const source = batch.source?.trim();
  if (!source) throw new Error("source が必要です");
  const items = Array.isArray(batch.items) ? batch.items : [];
  if (!items.length) throw new Error("items が空です");
  if (items.length > MAX_ITEMS_PER_BATCH) throw new Error(`items が多すぎます (最大 ${MAX_ITEMS_PER_BATCH}件)`);

  const batchKey = batch.batchKey?.trim() || undefined;

  if (batchKey) {
    const existing = await db
      .prepare("SELECT id FROM ingest_ops WHERE batch_key = ? AND status = 'done' LIMIT 1")
      .bind(batchKey)
      .first<{ id: string }>();
    if (existing) {
      return { status: "duplicate", accepted: 0, skipped: items.length, duplicateBatch: true };
    }
  }

  const opId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO ingest_ops (id, source, batch_key, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, 'processing', ?)`,
    )
    .bind(opId, source, batchKey ?? null, JSON.stringify(batch), Date.now())
    .run();

  let accepted = 0;
  let skipped = 0;
  const touchedKeys = new Set<string>();

  try {
    for (const item of items) {
      const collectedAt = toInt(item.collectedAt);
      if (!collectedAt) {
        skipped += 1;
        continue;
      }
      const matchKey = resolveMatchKey(item);
      touchedKeys.add(matchKey);
      const res = await db
        .prepare(
          `INSERT OR IGNORE INTO sold_stats
             (id, match_key, query, jan, source, condition, currency,
              sold_min, sold_median, sold_avg, sold_max, sample_size,
              sold_count_7d, active_count, window_days, collected_at, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          matchKey,
          (item.query || "").trim(),
          item.jan ? String(item.jan).replace(/[^0-9]/g, "") || null : null,
          item.source?.trim() || source,
          normalizeCondition(item.condition),
          item.currency?.trim() || "JPY",
          toInt(item.soldMin),
          toInt(item.soldMedian),
          toInt(item.soldAvg),
          toInt(item.soldMax),
          toInt(item.sampleSize) ?? 0,
          toInt(item.soldCount7d),
          toInt(item.activeCount),
          toInt(item.windowDays),
          collectedAt,
          item.raw != null ? JSON.stringify(item.raw) : null,
        )
        .run();
      if ((res.meta?.changes ?? 0) > 0) accepted += 1;
      else skipped += 1;
    }

    // 時系列の保持上限（match_key ごとに最新 RETAIN_PER_KEY 件）
    for (const key of touchedKeys) {
      await db
        .prepare(
          `DELETE FROM sold_stats
           WHERE match_key = ? AND id NOT IN (
             SELECT id FROM sold_stats WHERE match_key = ? ORDER BY collected_at DESC LIMIT ?
           )`,
        )
        .bind(key, key, RETAIN_PER_KEY)
        .run();
    }

    await db
      .prepare(
        "UPDATE ingest_ops SET status = 'done', processed_at = ?, accepted = ?, skipped = ?, error = NULL WHERE id = ?",
      )
      .bind(Date.now(), accepted, skipped, opId)
      .run();
  } catch (e) {
    await db
      .prepare(
        "UPDATE ingest_ops SET status = 'failed', processed_at = ?, accepted = ?, skipped = ?, error = ? WHERE id = ?",
      )
      .bind(Date.now(), accepted, skipped, String((e as Error)?.message || e), opId)
      .run();
    throw e;
  }

  return { status: "done", accepted, skipped };
}

export interface SoldStatsView {
  matchKey: string;
  latestByCondition: Record<string, SoldStat>;
  history: SoldStat[];
}

/** match_key の最新スナップショット（状態ランク別）＋ 履歴（新しい順）を返す。 */
export async function listSoldStats(env: Env, matchKey: string, limit = 30): Promise<SoldStatsView> {
  const db = getDb(env);
  const safeLimit = Math.min(Math.max(Math.round(limit) || 30, 1), 200);
  const { results } = await db
    .prepare("SELECT * FROM sold_stats WHERE match_key = ? ORDER BY collected_at DESC LIMIT ?")
    .bind(matchKey, safeLimit)
    .all<SoldStatRow>();
  const history = (results || []).map(rowToSoldStat);
  const latestByCondition: Record<string, SoldStat> = {};
  for (const row of history) {
    if (!latestByCondition[row.condition]) latestByCondition[row.condition] = row;
  }
  return { matchKey, latestByCondition, history };
}
