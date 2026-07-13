# collector — レイヤーB(収集ワーカー)

公式APIで取れない「実売相場・回転率」を集めて、`/api/ingest` 経由で D1(`sold_stats`) に投入する。
本ディレクトリは Cloudflare の外（手元PC / 小VPS）で動かす前提。設計は `docs/two-layer-architecture.md`。

## セットアップ（サーバー側）

1. マイグレーション適用（`sold_stats` / `ingest_ops` を作成）
   ```bash
   npm run db:migrate:local                 # ローカル
   npx wrangler d1 migrations apply souba-checker-workspace --remote   # 本番
   ```
2. 取込トークンを登録（未設定だと `/api/ingest` は 503 で無効）
   ```bash
   npx wrangler pages secret put INGEST_TOKEN --project-name souba-checker
   ```

## Phase 1: CSV 取込

依存ゼロ（Node 18+ の組込 fetch）。

```bash
INGEST_URL=https://souba-checker-88k.pages.dev \
INGEST_TOKEN=xxxxx \
node collector/ingest-csv.mjs --file collector/sample.csv --source aucfan
```

CSVヘッダ（列は順不同・欠けてもOK）:
`query, jan, source, condition, sold_min, sold_median, sold_avg, sold_max, sample_size, sold_count_7d, active_count, window_days, collected_at`

- `condition`: `like_new | good | fair | junk | unknown`（省略時 `unknown`）
- `collected_at`: ISO日付(`2026-07-01`) か epoch ms（省略時は実行時刻）
- `--batch-key <key>` を付けると同一バッチの二重取込を防げる（冪等）

## 確認（読み取り）

```bash
# match_key は JAN優先(jan:4902370548495) / 無ければ q:<正規化クエリ>
curl "https://souba-checker-88k.pages.dev/api/sold?key=jan:4902370548495"
```

## API

| メソッド | パス | 認証 | 用途 |
|----------|------|------|------|
| POST | `/api/ingest` | `Bearer INGEST_TOKEN` | 収集バッチ投入 |
| GET  | `/api/sold?key=&limit=` | ワークスペース認証(設定時) | 実売相場の最新＋履歴 |

## 次のPhase（設計のみ）
- Phase 2: Keepa / オークファンAPI を日次バッチで正規化 → `/api/ingest`
- Phase 3: Playwright でメルカリ売切/ヤフオク落札（自己利用・低頻度）
