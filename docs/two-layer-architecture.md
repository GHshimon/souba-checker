# 二層アーキテクチャ設計図 — 収集ワーカー → D1

> 目的: 公式APIでは取れない「中古の実売相場」「回転率」を、**個人利用に割り切って**収集し、
> 既存の相場チェッカー（Cloudflare Pages）に取り込むための構成。
> 最終更新: 2026-07-13 / 対象ブランチ: `claude/used-goods-tool-review-5w445h`

---

## 1. なぜ二層にするのか

現状は **1層**（Cloudflare Pages + 公式API）で完結している。

| データ | 取得元 | 状態 |
|--------|--------|------|
| 新品 販売中相場 | 楽天 / Yahoo!ショッピング API | ✅ 取得済み |
| 中古 販売中相場 | 同上（検索語+「中古」） | △ 精度限定 |
| **中古 実売相場（落札・売切）** | メルカリ売切 / ヤフオク落札 / オークファン | ❌ **公式APIなし** |
| **回転率・売れ行き** | メルカリ売切件数 / ヤフオク入札 / Amazonランク | ❌ **公式APIなし** |

買取判断の核心（「いくらで・どれくらいの速さで売れるか」）が、まさに公式APIの空白地帯にある。
**Cloudflare Pages Functions ではヘッドレスブラウザが動かない**ため、スクレイピングや重い収集処理をCF内では回せない。

→ **「公式APIで取れるもの（CF内）」と「取れないもの（別ワーカー）」を分離**し、
後者は手元/VPSで収集して **D1（既存DB）に蓄積** する。UIはD1を読むだけにする。

---

## 2. 全体構成

```
┌─────────────────────────── レイヤーA: Cloudflare Pages（既存・変更小） ──────────────────────────┐
│                                                                                                  │
│   [ブラウザ / PWA]  ── /api/identify (Gemini) ── /api/prices (楽天・Yahoo公式) ──┐                │
│         │                                                                        │                │
│         │  実売相場・回転率を表示 ◀── /api/sold （D1読み取り・新規）─────────────┤                │
│         │  集計リスト（Insights）  ◀── /api/workspace/* （既存）─────────────────┤                │
│         ▼                                                                        ▼                │
│                                     ┌──────────────── D1: souba-checker-workspace ─────────────┐  │
│                                     │ watchlist / reports / watchlist_ops（既存）              │  │
│                                     │ sold_stats（新規: 実売相場・回転率）                     │  │
│                                     │ ingest_ops（新規: 取込キュー・監査）                     │  │
│                                     └───────────────────────────────▲────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┼────────────────────────────┘
                                                                        │  HTTPS + Bearer（書き込み専用トークン）
                                                                        │  POST /api/ingest
┌─────────────────────── レイヤーB: 収集ワーカー（手元PC / 小VPS / Browserless）─────────────────────┐
│                                                                                                    │
│   スケジューラ（cron / node-cron）                                                                 │
│     ├─ 手動CSV取込（Phase 1）  ── オークファン等のCSVを正規化 ─┐                                    │
│     ├─ 有料API収集（Phase 2）  ── Keepa / オークファンAPI ─────┤ → 正規化 → /api/ingest に push     │
│     └─ ブラウザ収集（Phase 3） ── Playwright(既存の同梱Chromium) でメルカリ売切/ヤフオク落札 ─┘     │
│                                                                                                    │
│   ※ レート自制・キャッシュ・リトライはここで完結。壊れても本番UIには影響しない。                   │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

要点:
- **レイヤーAは既存構成をほぼ据え置き**。読み取り用 `/api/sold` と 書き込み用 `/api/ingest` を足すだけ。
- **レイヤーBはCFの外**。スクレイピング/有料API/重い正規化はすべてここ。障害・仕様変更の影響をUIから隔離。
- 両者の**唯一の接点はD1**（+ `/api/ingest` エンドポイント）。疎結合。

---

## 3. データモデル（D1拡張）

既存規約に踏襲: `snake_case` 列 / `TEXT` UUID主キー / JSONは `*_json` / キュー＋監査は `*_ops`。

`migrations/0002_sold.sql`（案）:

```sql
-- 実売相場・回転率のスナップショット（1商品×1収集時点×1情報源）
CREATE TABLE IF NOT EXISTS sold_stats (
  id            TEXT PRIMARY KEY,      -- UUID
  match_key     TEXT NOT NULL,         -- 正規化キー（JAN優先、無ければ正規化クエリ）
  query         TEXT NOT NULL,         -- 収集に使った検索語
  jan           TEXT,                  -- あれば
  source        TEXT NOT NULL,         -- 'mercari_sold' | 'yahuoku_closed' | 'aucfan' | 'keepa' | 'csv'
  condition     TEXT NOT NULL DEFAULT 'unknown', -- 状態ランク: 'like_new'|'good'|'fair'|'junk'|'unknown'
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

CREATE INDEX IF NOT EXISTS idx_sold_match_key   ON sold_stats(match_key, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sold_collected_at ON sold_stats(collected_at DESC);

-- 取込キュー兼監査ログ（watchlist_ops と同じ設計）
CREATE TABLE IF NOT EXISTS ingest_ops (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  payload_json TEXT NOT NULL,          -- 収集ワーカーが投げたバッチ
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
  created_at   INTEGER NOT NULL,
  processed_at INTEGER,
  error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingest_ops_pending ON ingest_ops(status, created_at ASC);
```

設計判断:
- **時系列で貯める**（上書きしない）。`match_key + collected_at` で最新も履歴トレンドも取れる。価格アラートに直結。
- **状態ランク（condition）を第一級**に。買取は状態差が命。情報源が状態を持たない場合は `unknown`。
- **`match_key` で名寄せ**。JANがあればJAN、無ければ `price-matching.ts` の `normalizeQueryText` と同じ正規化を再利用（ロジック二重持ちを避けるため、正規化関数を `functions/_utils` から共有）。
- **回転率は `sold_count_7d` と `active_count`** の比で表現。`sold_count_7d / active_count` が高いほど「売れ筋・在庫はけやすい」。

---

## 4. 書き込み経路（ワーカー → D1）の選択肢

| 方式 | 概要 | 評価 |
|------|------|------|
| **A. 専用エンドポイント `/api/ingest`（推奨）** | ワーカーが正規化済みバッチをHTTP POST。CF側が検証してD1へ。 | ✅ 疎結合・検証集中・トークンで保護。既存 `watchlist_ops` と同じキュー方式に載る |
| B. D1 REST API直叩き | Cloudflare APIでSQL直投入 | △ アカウントトークンが強すぎ・SQL構築がワーカー側に漏れる |
| C. `wrangler d1 execute` | ローカルからCLIで流し込み | △ 手動運用向き。自動化にはA |

**採用: A**。`/api/ingest` は `INGEST_TOKEN`（書き込み専用シークレット）で保護。
受信 → `ingest_ops` に積む → `processIngestQueue()` で `sold_stats` へ反映（`watchlist_ops` の `processWatchlistQueue` と同型）。冪等キーで二重取込を防ぐ。

エンドポイント（案）:

```
POST /api/ingest        # 収集バッチ投入（Bearer: INGEST_TOKEN 必須）
  body: { source, batchKey, items: SoldStatInput[] }
  → ingest_ops へ enqueue、その場で処理、{ accepted, skipped } を返す

GET  /api/sold?key=<match_key>&limit=30   # UI読み取り（最新＋履歴）
  → { latestByCondition: {...}, history: SoldStat[] }
```

---

## 5. 収集ワーカー（レイヤーB）の段階導入

CFの外の小さなNodeプロジェクト（`collector/`。別リポでも可）。**Phaseで薄く始める。**

### Phase 1 — 手動CSV取込（実装最小・即効）
- オークファン等からDLしたCSVを正規化して `/api/ingest` に送るスクリプト1本。
- 収集自動化ゼロでも「実売中央値」がUIに乗る。費用0・ToSリスク最小。まずここで価値を出す。

### Phase 2 — 有料API収集（安定・低保守）
- **Keepa**: Amazonの価格・**売れ筋ランク履歴** → 回転率の代理として強力。API安定・保守小。
- **オークファンAPI**: ヤフオク/メルカリ落札相場をまとめて。
- node-cron で日次バッチ → 正規化 → `/api/ingest`。

### Phase 3 — ブラウザ収集（最大射程・要保守）
- **Playwright（この環境に同梱のChromium流用可）** でメルカリ売切/ヤフオク落札を取得。
- **自分のログインセッション**を使う。**レート自制必須**（数百件/日、ランダム間隔）。
- 壊れてもUunに影響しない設計（=二層の恩恵）。ToSグレーゾーンのため自己利用限定・低頻度。

ワーカー擬似コード:
```ts
// collector/run.ts（レイヤーB, CFの外）
for (const target of loadTargets()) {           // watchlist をAPIから取得 or ローカル定義
  const raw = await collect(target);             // csv | keepa | playwright
  const items = normalize(raw, target);          // → SoldStatInput[]（match_key/condition/中央値/件数）
  await postIngest({ source, batchKey: hash(target, day), items }); // /api/ingest
  await sleep(jitter());                          // レート自制
}
```

---

## 6. UIへの統合

- **ProductCard**: 「中古参考（販売中）」の下に **「実売相場（D1）」セクション**を追加。
  状態ランク別の中央値・レンジ・サンプル数・**回転率（7日売切/出品中）**を表示。
- **上限仕入れ値**（今回実装の `profit.ts`）の `想定売価` 既定値を、
  **実売中央値があればそれを最優先**（無ければ現行の販売中中央値にフォールバック）。
  → 「販売中の希望価格」ではなく「実際に売れた価格」から上限を逆算できるようになる。
- **集計リスト（Insights）**: 既存の週次 `reports` に実売系メトリクスを合流。価格アラート（前週比下落）を追加。

---

## 7. 認証・シークレット

| シークレット | 層 | 用途 |
|--------------|----|----|
| `INGEST_TOKEN` | A / B 双方 | `/api/ingest` の書き込み認可（Bearer） |
| `WORKSPACE_PASSWORD` | A | 既存の集計リスト閲覧認証（据え置き） |
| Keepa / オークファン等のキー | **Bのみ** | 収集ワーカー側だけが保持。CF・フロントには置かない |

要点: **収集系のキーはレイヤーBに閉じ込める**。CF/フロントに露出させない。`/api/ingest` は書き込み専用トークンで、読み取り側（`/api/sold`）とは分離。

---

## 8. 品質・運用の勘所

- **冪等性**: `batchKey`（source+対象+日付のhash）で重複取込を弾く。`ingest_ops` に監査痕を残す。
- **鮮度**: `collected_at` を持ち、UIで「◯時間前」を表示。古いデータは判断材料から自動降格。
- **信頼度**: `sample_size` が小さい実売中央値は「参考（母数少）」と明示。母数0は非表示。
- **保守コスト**: スクレイパはHTML変更で壊れる前提。**Phase1/2（CSV・API）を主、Phase3（ブラウザ）を従**に。
- **ToS/リスク**: 自己利用・低頻度・再配布しないを厳守。自動ログインはBANリスクゼロではない。
- **保持上限**: `reports` と同様に `sold_stats` も件数上限で古い行を間引く（例: match_keyごとに最新52点）。

---

## 9. 導入ロードマップ（最小工数順）

| # | やること | 層 | 効果 | 目安 |
|---|----------|----|----|----|
| 1 | `0002_sold.sql` + `/api/ingest` + `/api/sold` | A | 受け皿を作る | 小 |
| 2 | CSV取込スクリプト（Phase1） | B | 実売中央値がUIに乗る | 小 |
| 3 | ProductCardに実売セクション＋上限仕入れ値へ反映 | A | 判断精度が上がる | 小〜中 |
| 4 | Keepa連携で回転率（Phase2） | B | 「売れる速さ」が入る | 中 |
| 5 | 価格アラート（前週比下落） | A | 監視の自動化 | 中 |
| 6 | Playwright収集（Phase3） | B | 射程最大化 | 中〜大・要保守 |

---

## 10. 次の一歩（この設計を動かす最小PR）

1. `migrations/0002_sold.sql` を追加（本書 §3）。
2. `functions/_utils/sold-db.ts`（`workspace-db.ts` と同型のキュー処理）。
3. `functions/api/ingest.ts` / `functions/api/sold.ts`。
4. `collector/` に CSV→`/api/ingest` の最小スクリプト（Phase1）。
5. ProductCard の `想定売価` 既定値を実売中央値優先に切替（`profit.ts` はそのまま使える）。

> `price-matching.ts` の `normalizeQueryText` を収集ワーカーと共有し、`match_key` の名寄せロジックを一本化すること（二重実装は名寄れ崩れの元）。
