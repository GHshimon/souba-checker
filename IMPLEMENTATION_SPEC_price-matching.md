# 相場チェッカー 実装仕様書（汎用価格マッチング強化）

最終更新: 2026-06-03  
対象: 別セッションでの実装着手用

---

## 1. 背景と課題

現状は、型式検索で取得した候補に「周辺アイテム（ケース・カバー・ストラップ・充電器・レンズ等）」が混在しやすく、最安/平均/中央値が実態よりブレる。

この傾向はカメラ以外（PC、バッグ、家電など）でも共通して発生するため、カテゴリ個別対応ではなく**カテゴリ共通の本体判定ロジック**が必要。

---

## 2. 目的

1. 価格候補を `main(本体)` / `bundle(キット)` / `accessory(周辺品)` / `unknown` に分類する  
2. デフォルトは `main` のみで統計を算出する  
3. 除外理由を可視化して、ユーザーが判断可能にする  
4. カメラ/PC/バッグを含むカテゴリ横断で同じロジックを適用する

---

## 3. スコープ

### In Scope
- `/api/prices` の候補判定・フィルタ・集計ロジック改修
- フロントの価格一覧UIに「分類」「除外理由」「集計対象切替」を追加
- 既存CSV出力に判定情報を追加

### Out of Scope（今回）
- 外部有料データソース連携
- OCR高度化・画像特徴量照合
- モデル学習基盤

---

## 4. 機能仕様

## 4.1 クエリ解析（共通）

入力: `query`, `maker(任意)`  
出力: `QuerySignature`

```ts
type QuerySignature = {
  original: string;
  normalized: string;
  requiredTokens: string[];   // 例: ["thinkpad", "x1"]
  optionalTokens: string[];   // 例: ["gen", "carbon"]
  maker?: string;
};
```

ルール:
- 全角半角、ハイフン、空白、括弧を正規化
- 2文字以上の英数トークンを優先
- `maker` がある場合は正規化して必須寄りに扱う

## 4.2 候補評価（共通）

各候補に `ScoredListing` を付与:

```ts
type ItemType = "main" | "bundle" | "accessory" | "unknown";

type ScoredListing = {
  title: string;
  price: number;
  url: string;
  site: "rakuten" | "yahooShopping";
  match: {
    requiredTokenHitRate: number; // 0.0 - 1.0
    modelExact: boolean;
    makerHit: boolean;
  };
  itemType: ItemType;
  scores: {
    coreMatch: number;  // 0-100
    itemType: number;   // -100 to +100
    noise: number;      // 0-100
    total: number;      // 合算
  };
  reasons: string[];    // 例: ["required_token_miss", "accessory_keyword"]
  included: boolean;    // 集計対象か
};
```

判定ロジック（初期値）:
- `coreMatch`
  - 必須トークン一致率
  - 型番完全一致ボーナス
  - メーカー一致ボーナス
- `itemType`（辞書ベース）
  - 本体系キーワード: `本体`, `ボディ`, `laptop`, `notebook`, `camera` 等を加点
  - キット語: `kit`, `セット`, `レンズキット` は `bundle` 寄り
  - 周辺語: `ケース`, `カバー`, `ストラップ`, `充電器`, `バッテリー`, `保護`, `レンズフィルター` などで `accessory`
- `noise`
  - 必須トークン不足
  - 周辺語ヒット
  - 価格外れ値（後段）

## 4.3 集計対象の決定

デフォルト:
- `included = itemType === "main" && total >= threshold`
- `threshold` 初期値: 55

UI切替:
- 「本体のみ集計（default ON）」OFF時:
  - `bundle` を含める
  - `accessory` は原則除外（別トグルを今後検討）

## 4.4 統計算出

対象 `included=true` の価格から算出:
- `min`, `max`, `avg`, `median`, `count`

外れ値対策:
- 価格100円未満除外（既存）
- 追加: 上下10%トリム（件数8以上で適用）

エラー時:
- APIエラー候補は集計から除外
- `warnings[]` に理由を残す

## 4.5 APIレスポンス拡張

`/api/prices` の `PriceSummary.items[]` を拡張:

```ts
{
  title: string;
  price: number;
  url: string;
  itemType: "main" | "bundle" | "accessory" | "unknown";
  included: boolean;
  score: number;
  reasons: string[];
}
```

後方互換:
- 既存フィールド（`min`, `avg`, `median` 等）は維持

---

## 5. UI仕様

## 5.1 商品カード内 価格一覧

表示項目追加:
- `分類`: 本体/キット/周辺/不明
- `判定スコア`
- `除外理由`
- `集計対象` チェック（手動override）

操作:
- 「本体のみ集計」トグル（デフォルトON）
- Shift範囲選択は既存仕様維持

## 5.2 CSV出力

CSV列追加:
- `itemType`
- `included`
- `score`
- `reasons`

---

## 6. データモデル変更

- `types/index.ts`
  - `PriceSummary.items[]` に `itemType`, `included`, `score`, `reasons` を追加
- `functions/_utils/api-clients.ts`
  - 候補評価関数群追加
  - 集計前フィルタ実装

---

## 7. 実装タスク分解

1. **QuerySignature実装**
   - 正規化/トークン抽出ユーティリティ追加

2. **候補スコアリング実装**
   - `classifyItemType(title)`
   - `scoreListing(title, signature)`
   - `buildReasons(...)`

3. **集計対象選定**
   - `included` 判定
   - threshold定数化

4. **統計計算更新**
   - 上下10%トリム導入（件数条件付き）

5. **APIレスポンス拡張**
   - `items[]` に判定情報を追加

6. **フロントUI反映**
   - 一覧表示列追加
   - 「本体のみ集計」トグル
   - CSV列追加

7. **回帰確認**
   - 既存フロー（単一商品・CSV・集計）壊れていないことを確認

---

## 8. 受け入れ条件（Acceptance Criteria）

1. カメラ本体検索時に、ケース/カバー/ストラップ等が `accessory` 判定され、デフォルト集計から除外される  
2. PC本体検索時に、メモリ/SSD/ACアダプタ等が同様に除外される  
3. 「本体のみ集計」をOFFにした場合、`bundle` が統計へ反映される  
4. 各候補で「なぜ除外されたか」がUI上で確認できる  
5. CSVに判定情報（分類・スコア・理由）が出力される  
6. APIエラー候補は統計に含まれない  
7. 既存の中央値・最安リンク表示は維持される

---

## 9. リスクと対策

- **辞書の過検知/過除外**
  - 対策: `included` 手動上書き可能にする
- **ブランド依存語彙**
  - 対策: 最初は共通辞書 + 後でカテゴリ辞書を追加
- **計算量増加**
  - 対策: 候補数上限30件維持、スコアリングは文字列処理のみ

---

## 10. 推奨デフォルト設定

- 集計対象: `main` のみ  
- 指標表示: `中古 × 中央値`  
- 欠損値補間: しない  
- APIエラー: 集計除外  
- 週ラベル: レポート実行日ベース  

