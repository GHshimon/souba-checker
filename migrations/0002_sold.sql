-- 実売相場・回転率のスナップショット（1商品 × 1収集時点 × 1情報源 × 状態ランク）
-- 二層アーキ設計 docs/two-layer-architecture.md §3 を参照。
CREATE TABLE IF NOT EXISTS sold_stats (
  id            TEXT PRIMARY KEY,      -- UUID
  match_key     TEXT NOT NULL,         -- 名寄せキー（JAN優先、無ければ正規化クエリ）
  query         TEXT NOT NULL,         -- 収集に使った検索語
  jan           TEXT,                  -- あれば
  source        TEXT NOT NULL,         -- 'mercari_sold' | 'yahuoku_closed' | 'aucfan' | 'keepa' | 'csv' 等
  condition     TEXT NOT NULL DEFAULT 'unknown', -- 状態ランク: like_new|good|fair|junk|unknown
  currency      TEXT NOT NULL DEFAULT 'JPY',
  sold_min      INTEGER,               -- 実売レンジ
  sold_median   INTEGER,               -- ★買取判断の基準に使う中央値
  sold_avg      INTEGER,
  sold_max      INTEGER,
  sample_size   INTEGER NOT NULL DEFAULT 0,  -- 母数（信頼度）
  sold_count_7d INTEGER,               -- 直近7日の売れた件数（回転率の代理）
  active_count  INTEGER,               -- 出品中件数（供給の代理）
  window_days   INTEGER,               -- 集計対象期間
  collected_at  INTEGER NOT NULL,      -- 収集時刻(ms)
  raw_json      TEXT                   -- 元データ（監査・再集計用）
);

CREATE INDEX IF NOT EXISTS idx_sold_match_key ON sold_stats(match_key, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sold_collected_at ON sold_stats(collected_at DESC);

-- 同一スナップショットの二重取込を弾く（行レベルの冪等性）
CREATE UNIQUE INDEX IF NOT EXISTS uq_sold_snapshot ON sold_stats(match_key, source, condition, collected_at);

-- 取込キュー兼監査ログ（watchlist_ops と同じ設計）
CREATE TABLE IF NOT EXISTS ingest_ops (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  batch_key    TEXT,                   -- バッチ冪等キー（source+対象+日付のhash等）
  payload_json TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
  created_at   INTEGER NOT NULL,
  processed_at INTEGER,
  error        TEXT,
  accepted     INTEGER,                -- 実際に取り込めた件数
  skipped      INTEGER                 -- 重複等でスキップした件数
);

CREATE INDEX IF NOT EXISTS idx_ingest_ops_pending ON ingest_ops(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ingest_ops_batch ON ingest_ops(batch_key);
