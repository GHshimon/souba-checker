# 相場チェッカーアプリ — 引き継ぎ資料

> 新チャット用。最終更新: 2026-05-31  
> プロジェクトパス: `d:\Private\shimon\Project\相場チェッカーアプリ`

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| **名称** | 相場チェッカー（souba-checker） |
| **用途** | せどり・転売向け。商品写真 → 特定 → 相場確認 |
| **方針** | 完全無料運用（Cloudflare Pages + 各種無料API） |
| **状態** | MVP 本番デプロイ済み（https://souba-checker-88k.pages.dev） |

---

## 2. 技術スタック

```
フロント:  Vite 6 + React 19 + TypeScript
バック:    Cloudflare Pages Functions (functions/)
履歴:      IndexedDB (idb)
バーコード: BarcodeDetector API + Quagga2 (MIT)
ホスティング: Cloudflare Pages（予定）
```

---

## 3. アーキテクチャ

```
[ブラウザ / PWA]
  ├─ 画像アップロード（D&D / カメラ / 最大5枚）
  ├─ バーコード読取（JAN補助）
  ├─ IndexedDB 履歴
  └─ /api/* へ fetch（vite proxy → :8788）

[Cloudflare Pages Functions]
  POST /api/identify  → Gemini API（商品特定）
  POST /api/prices    → 楽天 + Yahoo!ショッピング（参考価格）
  POST /api/jan       → Yahoo!ショッピング JAN検索（現状フロント未使用）

[外部API]
  Gemini API          → 商品特定（メイン）
  楽天 Ichiba API     → 最安/平均
  Yahoo Shopping v3   → 最安/平均（新品参考）
  ヤフオク / メルカリ  → 検索リンクのみ（公式APIなし）
```

---

## 4. ユーザーフロー（現行）

1. 画像を1〜5枚アップロード
2. バーコードスキャン（JANがあれば Gemini にヒントとして渡す）
3. **Gemini で商品特定**（型番・検索ワード・確信度）
4. `/api/prices` で楽天 + Yahoo!ショッピングの参考価格取得
5. ヤフオク・メルカリ等は検索リンクで手動確認
6. 仕入れ値入力 → 想定粗利表示
7. 履歴は IndexedDB に保存（最大50件）

**Gemini 失敗時:** JAN が読めていれば JAN コードで相場検索のみ続行。

---

## 5. 環境変数（`.dev.vars`）

`.dev.vars` は git 管理外。テンプレートは `.dev.vars.example`。

| 変数名 | 用途 |
|--------|------|
| `GEMINI_API_KEY` | Google AI Studio の API キー |
| `GEMINI_MODEL` | 推奨: `gemini-2.5-flash`（2.0系は2026-03-03廃止） |
| `RAKUTEN_APP_ID` | 楽天 Application ID（UUID形式） |
| `RAKUTEN_ACCESS_KEY` | 楽天 Access Key（`pk_` 始まり） |
| `RAKUTEN_REFERER` | 楽天「許可されたWebサイト」と一致させる URL |
| `YAHOO_CLIENT_ID` | Yahoo デベロッパー Client ID |

### 楽天 API 登録メモ

- **Application type:** `Web Application`（ドメイン許可方式）
- **Allowed websites:** ドメインのみ（URL不可）
  ```
  souba-checker.pages.dev
  *.souba-checker.pages.dev
  ```
- **RAKUTEN_REFERER:** `https://souba-checker.pages.dev`（ローカルでも Referer として送る）
- 旧エンドポイント `app.rakuten.co.jp` は使用しない
- 新エンドポイント: `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401`

### Yahoo API 登録メモ

- **ID連携不要**（Web API のみ利用）
- ショッピング商品検索 v3: 接続 OK
- **ヤフオク API: 2018年2月提供終了 → 403 Forbidden。** 使用不可

### Gemini モデル移行

- 参考: https://zenn.dev/chameleonmeme/articles/6714630ff456d7
- デフォルト: `gemini-2.5-flash`
- フォールバック: `gemini-2.5-flash-lite`
- 廃止済み/非推奨: `gemini-2.0-flash`, `gemini-2.0-flash-lite`
- 無料枠超過時はリトライ + 日本語エラー表示

---

## 6. ローカル起動手順

**ターミナル1（API）**
```bash
cd "d:\Private\shimon\Project\相場チェッカーアプリ"
npm run build
npx wrangler pages dev dist --compatibility-date=2024-11-01 --port 8788
```

**ターミナル2（フロント）**
```bash
npm run dev
```

- フロント: http://localhost:5173/
- API: http://localhost:8788/
- Vite が `/api` を 8788 にプロキシ（`vite.config.ts`）

**よくあるエラー**
- `ERR_CONNECTION_REFUSED :5173` → `npm run dev` 未起動
- Gemini quota exceeded → 待機 / 新APIキー / 利用状況確認
- 楽天 403 → Allowed websites / RAKUTEN_REFERER 不一致

---

## 7. ディレクトリ構成

```
相場チェッカーアプリ/
├── src/                    # React フロント
│   ├── App.tsx             # メインフロー
│   ├── components/         # DropZone, ProductCard, etc.
│   ├── lib/                # api.ts, db.ts, image.ts, constants.ts
│   └── types/
├── functions/              # Cloudflare Pages Functions
│   ├── api/
│   │   ├── identify.ts     # Gemini 商品特定
│   │   ├── prices.ts       # 楽天 + Yahoo Shopping 価格
│   │   └── jan.ts          # JAN→商品名（未使用だが実装あり）
│   └── _utils/
│       ├── api-clients.ts  # 外部API呼び出し本体
│       └── helpers.ts      # Env型, json/error ヘルパー
├── public/manifest.json      # PWA 最小設定
├── dist/                     # ビルド出力
├── .dev.vars                 # ローカルシークレット（gitignore）
├── wrangler.toml
├── implementation-plan.md    # 当初の4フェーズ計画書
├── component-research.md     # ライセンス/API調査
├── souba-checker-mvp.jsx     # 初期プロトタイプ（参考用）
├── price-lookup.jsx          # 初期プロトタイプ（参考用）
└── HANDOVER.md               # 本ファイル
```

---

## 8. API エンドポイント仕様

### POST /api/identify
```json
// Request
{ "images": ["base64..."], "jan": "4902370534246" }

// Response
{
  "product_name": "...",
  "brand": "...",
  "model": "...",
  "category": "...",
  "jan_code": "...",
  "search_query": "...",
  "confidence": "high|medium|low",
  "missing_info": "..."
}
```
- 画像は最大 **3枚** 送信（トークン節約）

### POST /api/prices
```json
// Request
{ "query": "任天堂 スイッチ" }

// Response
{
  "rakuten": { "min": 106, "max": 198, "avg": 162, "count": 30, "currency": "JPY" },
  "yahooShopping": { "min": ..., "max": ..., "avg": ..., "count": ..., "currency": "JPY" },
  "warnings": ["rakuten: ..."]  // 任意
}
```
- 100円未満の価格はノイズ除去フィルタあり

### POST /api/jan
- Yahoo Shopping で JAN → 商品名（フロントからは現在未使用）

---

## 9. 実装済み / 未実装

### ✅ 実装済み
- [x] Vite + React + TypeScript プロジェクト
- [x] 複数画像アップロード（最大5枚）+ D&D
- [x] バーコード読取（BarcodeDetector + Quagga2）
- [x] Gemini 商品特定（JAN ヒント付き）
- [x] 楽天 API 価格取得
- [x] Yahoo!ショッピング API 価格取得
- [x] 5サイト検索リンク（楽天/ヤフオク/Amazon/メルカリ/Yahoo!ショッピング）
- [x] 検索ワード編集
- [x] 利益計算（仕入れ値 → 想定粗利）
- [x] IndexedDB 履歴
- [x] Gemini クォータエラー対応（モデル切替・リトライ・JANフォールバック）
- [x] PWA manifest.json（最小）

### ❌ 未実装（implementation-plan.md 参照）
- [x] Cloudflare Pages 本番デプロイ（`souba-checker-88k.pages.dev`）
- [ ] KV キャッシュ（画像ハッシュ）
- [ ] 1画像複数商品の自動分類
- [ ] 類似型番リストアップ
- [ ] 背景除去（rembg-webgpu MIT 候補）
- [ ] PWA 完全化（vite-plugin-pwa, アイコン）
- [ ] ヤフオク中古相場の自動取得（公式API終了のため別手段要検討）
- [ ] Amazon PA-API
- [ ] バーコードのみでの商品特定（Gemini 不使用パス — 方針変更で Gemini 中心）

---

## 10. 既知の問題・注意点

| 問題 | 詳細 | 対処 |
|------|------|------|
| Gemini 無料枠 | 1日上限あり。`limit: 0` はキー/モデルに枠なしの可能性 | 待機・新キー・課金有効化 |
| ヤフオク API | 2018年終了。403 Forbidden | 検索リンクのみ |
| 楽天 Referer | Web Application 登録必須 | Allowed websites + RAKUTEN_REFERER 一致 |
| Yahoo Shopping 最安 | 1円商品等のノイズ | 100円未満フィルタ済み（完璧ではない） |
| 中古相場 | API で自動取得不可 | ヤフオク/メルカリは手動 |
| git | 初期コミット前の可能性 | 未コミットファイル多数 |

---

## 11. 本番デプロイ

**前提:** `npx wrangler login` で Cloudflare に認証済みであること。

### 一括（推奨）

```powershell
cd "d:\Private\shimon\Project\相場チェッカーアプリ"
npx wrangler login
npm run deploy:production
```

`scripts/deploy-production.ps1` がビルド → Pages デプロイ → `.dev.vars` からシークレット登録を行う。  
`RAKUTEN_REFERER` は本番用に `https://souba-checker.pages.dev` へ上書きされる。

### 手動

```bash
npm run build
npx wrangler pages deploy dist --project-name souba-checker

# シークレット（値は .dev.vars から。RAKUTEN_REFERER は本番 URL）
npx wrangler pages secret put GEMINI_API_KEY --project-name souba-checker
# ... 他も同様
```

- 本番 URL: **https://souba-checker-88k.pages.dev**（プロジェクト名 `souba-checker`）
- 楽天 Allowed websites に `souba-checker-88k.pages.dev` を追加（旧想定 `souba-checker.pages.dev` とは別ホスト名）
- `RAKUTEN_REFERER=https://souba-checker-88k.pages.dev`（シークレット登録済み）

---

## 12. 次にやると良いこと（優先度順）

1. **Cloudflare Pages デプロイ** + 本番シークレット設定
2. **Gemini プロンプト調整**（せどり向け型番抽出精度）
3. **検索ワード品質向上**（API相場の min が付属品価格になる問題）
4. **PWA 完全化**（ホーム画面追加、アイコン）
5. **KV キャッシュ**（同一商品の API 消費削減）
6. **Phase 3 機能**（複数商品分類、類似型番 — implementation-plan.md 参照）

---

## 13. 参考ドキュメント（リポジトリ内）

| ファイル | 内容 |
|----------|------|
| `implementation-plan.md` | 4フェーズ実装計画・要件・API設計 |
| `component-research.md` | バーコード優先MVP再定義、ライセンス調査 |
| `souba-checker-mvp.jsx` | 初期UIプロトタイプ |
| `price-lookup.jsx` | Claude API 版プロトタイプ（参考のみ） |
| `.dev.vars.example` | 環境変数テンプレート |

---

## 14. 新チャットへの最初の指示例

```
相場チェッカーアプリの引き継ぎです。
HANDOVER.md と implementation-plan.md を読んでください。
次は [Cloudflare Pages デプロイ / Geminiプロンプト改善 / ...] を進めてください。
```

---

## 15. セキュリティ注意

- `.dev.vars` に API キーあり。**git にコミットしない**
- チャットや `.dev.vars.example` に本物のキーを載せない
- キーが漏れた可能性がある場合は各サービスで再発行
