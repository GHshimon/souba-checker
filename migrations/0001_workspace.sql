CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '未分類',
  frequency TEXT NOT NULL DEFAULT 'weekly',
  created_at INTEGER NOT NULL,
  last_aggregated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_watchlist_created_at ON watchlist(created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  watchlist_id TEXT NOT NULL,
  watchlist_name TEXT NOT NULL,
  category TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  run_at INTEGER NOT NULL,
  prices_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_run_at ON reports(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_watchlist_id ON reports(watchlist_id);

CREATE TABLE IF NOT EXISTS watchlist_ops (
  id TEXT PRIMARY KEY,
  op_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_watchlist_ops_pending ON watchlist_ops(status, created_at ASC);
