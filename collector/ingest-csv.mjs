#!/usr/bin/env node
/**
 * レイヤーB(収集ワーカー) Phase 1: CSV → /api/ingest
 *
 * オークファン等からエクスポートした実売相場CSVを正規化して D1 に投入する最小スクリプト。
 * 依存ゼロ（Node 18+ の組込 fetch を使用）。
 *
 * 使い方:
 *   INGEST_URL=https://souba-checker-88k.pages.dev \
 *   INGEST_TOKEN=xxxxx \
 *   node collector/ingest-csv.mjs --file collector/sample.csv --source aucfan
 *
 * CSVヘッダ（列名は順不同・欠けてもOK）:
 *   query, jan, source, condition, sold_min, sold_median, sold_avg, sold_max,
 *   sample_size, sold_count_7d, active_count, window_days, collected_at
 *   - condition: like_new|good|fair|junk|unknown（省略時 unknown）
 *   - collected_at: ISO日付(2026-07-01) か epoch ms。省略時は実行時刻
 */

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

// 引用符・カンマに対応した最小CSVパーサ
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function toNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toCollectedAt(v) {
  const s = String(v || "").trim();
  if (!s) return Date.now();
  if (/^\d{10,}$/.test(s)) return Number(s); // epoch ms
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Date.now();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file;
  const base = (args.url || process.env.INGEST_URL || "").replace(/\/$/, "");
  const token = args.token || process.env.INGEST_TOKEN || "";
  const source = args.source || "csv";
  const batchKey = args["batch-key"]; // 冪等キー（省略可）

  if (!file) throw new Error("--file <csv> が必要です");
  if (!base) throw new Error("--url または INGEST_URL が必要です");
  if (!token) throw new Error("--token または INGEST_TOKEN が必要です");

  const rows = parseCsv(readFileSync(file, "utf8"));
  if (rows.length < 2) throw new Error("データ行がありません");
  const header = rows[0].map((h) => h.trim());
  const idx = (name) => header.indexOf(name);

  const items = rows.slice(1).map((r) => ({
    query: r[idx("query")]?.trim() || "",
    jan: r[idx("jan")]?.trim() || null,
    source: r[idx("source")]?.trim() || source,
    condition: r[idx("condition")]?.trim() || "unknown",
    soldMin: toNum(r[idx("sold_min")]),
    soldMedian: toNum(r[idx("sold_median")]),
    soldAvg: toNum(r[idx("sold_avg")]),
    soldMax: toNum(r[idx("sold_max")]),
    sampleSize: toNum(r[idx("sample_size")]),
    soldCount7d: toNum(r[idx("sold_count_7d")]),
    activeCount: toNum(r[idx("active_count")]),
    windowDays: toNum(r[idx("window_days")]),
    collectedAt: toCollectedAt(r[idx("collected_at")]),
  })).filter((it) => it.query);

  if (!items.length) throw new Error("query 列が空の行しかありません");

  const res = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ source, batchKey, items }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ingest failed ${res.status}: ${text}`);
  console.log(`OK ${res.status}:`, text);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
