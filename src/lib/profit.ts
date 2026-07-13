/**
 * 仕入れ判断の金額計算（公式APIだけで完結する純粋関数）。
 *
 * 中古買取の判断は「最安値 − 仕入れ値」では過大評価になる。ここでは
 *   手取り（販売手数料・送料控除後） → 粗利・ROI → 上限仕入れ値の逆算
 * まで一気通貫で出す。UIから切り離してテスト・再利用しやすくする。
 */

export interface SellChannel {
  id: string;
  label: string;
  /** 販売手数料率（0〜1）。目安値。UI側で編集可能にする。 */
  feeRate: number;
}

/**
 * 主要販売チャネルの手数料目安。料率は改定されるため UI で上書き可能にすること。
 * 「店頭/その他」は手数料0（自店販売・卸など）。
 */
export const SELL_CHANNELS: SellChannel[] = [
  { id: "mercari", label: "メルカリ", feeRate: 0.1 },
  { id: "yahuoku", label: "ヤフオク", feeRate: 0.1 },
  { id: "yahoo_flea", label: "Yahoo!フリマ", feeRate: 0.05 },
  { id: "store", label: "店頭/その他", feeRate: 0 },
];

export interface NetInput {
  /** 想定売価（出品価格・送料込み想定） */
  sellPrice: number;
  /** 販売手数料率（0〜1） */
  feeRate: number;
  /** 送料（出品者負担・円） */
  shipping: number;
  /** 梱包資材などその他経費（円） */
  otherCost?: number;
}

/** 想定売価から手数料・送料・その他経費を引いた手取り（円）。 */
export function netProceeds({ sellPrice, feeRate, shipping, otherCost = 0 }: NetInput): number {
  if (!(sellPrice > 0)) return 0;
  const rate = clampRate(feeRate);
  return Math.round(sellPrice * (1 - rate) - shipping - otherCost);
}

export type ProfitTarget =
  | { mode: "amount"; value: number } // 確保したい粗利額（円）
  | { mode: "roi"; value: number }; // 対仕入れ利益率（ROI, 0〜。0.3 = 30%）

/**
 * 目標（粗利額 or ROI）を満たす上限仕入れ値（円）。
 * この額以下で仕入れれば目標を達成できる。買い被り防止のため切り捨て。
 *
 *  - amount: 上限 = 手取り − 目標粗利額
 *  - roi   : 粗利 = ROI × 仕入れ, 手取り = 仕入れ + 粗利 = 仕入れ×(1+ROI)
 *            ⇒ 上限 = 手取り ÷ (1 + ROI)
 */
export function maxBuyPrice(input: NetInput, target: ProfitTarget): number {
  const net = netProceeds(input);
  if (target.mode === "amount") {
    return Math.floor(net - target.value);
  }
  const roi = Math.max(-0.99, target.value);
  return Math.floor(net / (1 + roi));
}

export interface ProfitResult {
  /** 手取り（手数料・送料控除後） */
  net: number;
  /** 粗利 = 手取り − 仕入れ値 */
  profit: number;
  /** 対仕入れ利益率（ROI）。仕入れ0なら0 */
  roi: number;
  /** 対売価利益率。売価0なら0 */
  marginOnSell: number;
}

/** 実際の仕入れ値に対する手取り・粗利・ROI・利益率を評価する。 */
export function evaluateProfit(cost: number, input: NetInput): ProfitResult {
  const net = netProceeds(input);
  const profit = net - cost;
  return {
    net,
    profit,
    roi: cost > 0 ? profit / cost : 0,
    marginOnSell: input.sellPrice > 0 ? profit / input.sellPrice : 0,
  };
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  if (rate < 0) return 0;
  if (rate > 0.95) return 0.95;
  return rate;
}
