import type { PriceSummary } from "../types";

export type ItemType = "main" | "bundle" | "accessory" | "unknown";

export type PriceListItem = NonNullable<PriceSummary["items"]>[number];

export const INCLUSION_SCORE_THRESHOLD = 55;

export function itemTypeLabel(type?: ItemType) {
  switch (type) {
    case "main":
      return "本体";
    case "bundle":
      return "キット";
    case "accessory":
      return "周辺";
    default:
      return "不明";
  }
}

export function defaultIncludedForItem(item: PriceListItem, mainOnly: boolean) {
  if (item.includedOverride != null) return item.includedOverride;
  if (item.included != null) {
    if (mainOnly) return Boolean(item.included && item.itemType === "main");
    return Boolean(item.included);
  }
  const score = item.score ?? 0;
  if (mainOnly) return item.itemType === "main" && score >= INCLUSION_SCORE_THRESHOLD;
  return (item.itemType === "main" || item.itemType === "bundle") && score >= INCLUSION_SCORE_THRESHOLD;
}

export function trimPricesForStats(prices: number[]) {
  const sorted = [...prices].filter((p) => p >= 100).sort((a, b) => a - b);
  if (sorted.length < 8) return sorted;
  const trimCount = Math.floor(sorted.length * 0.1);
  return sorted.slice(trimCount, sorted.length - trimCount);
}

export function calcStatsFromPrices(prices: number[]) {
  if (!prices.length) return null;
  const min = prices[0];
  const max = prices[prices.length - 1];
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 1 ? prices[middle] : Math.round((prices[middle - 1] + prices[middle]) / 2);
  return { min, max, avg, median, count: prices.length };
}

export function summarizeIncludedItems(items: PriceListItem[], mainOnly: boolean) {
  const includedPrices = trimPricesForStats(
    items.filter((item) => defaultIncludedForItem(item, mainOnly)).map((item) => item.price),
  );
  return calcStatsFromPrices(includedPrices);
}

export function findCheapestIncludedItem(items: PriceListItem[], mainOnly: boolean) {
  const included = items.filter((item) => defaultIncludedForItem(item, mainOnly)).sort((a, b) => a.price - b.price);
  return included[0];
}

export function reasonLabels(reasons?: string[]) {
  if (!reasons?.length) return "—";
  const map: Record<string, string> = {
    required_token_miss: "必須語不足",
    model_inexact: "型番不一致",
    accessory_keyword: "周辺品キーワード",
    bundle_keyword: "キット語",
    item_type_unknown: "分類不明",
    main_keyword: "本体系キーワード",
    maker_hit: "メーカー一致",
    model_exact: "型番一致",
    excluded_not_main: "本体以外",
    below_score_threshold: "スコア不足",
    excluded_by_rule: "ルール除外",
    stats_excluded: "集計対象なし",
    model_required: "型番必須不一致",
  };
  return reasons.map((r) => map[r] || r).join(" / ");
}
