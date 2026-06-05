export type ItemType = "main" | "bundle" | "accessory" | "unknown";

export type PriceSite = "rakuten" | "yahooShopping";

export const INCLUSION_SCORE_THRESHOLD = 55;

export type QuerySignature = {
  original: string;
  normalized: string;
  requiredTokens: string[];
  optionalTokens: string[];
  maker?: string;
};

export type ScoredListing = {
  title: string;
  price: number;
  url: string;
  site: PriceSite;
  match: {
    requiredTokenHitRate: number;
    modelExact: boolean;
    makerHit: boolean;
  };
  itemType: ItemType;
  scores: {
    coreMatch: number;
    itemType: number;
    noise: number;
    total: number;
  };
  reasons: string[];
  included: boolean;
};

const MAIN_KEYWORDS = [
  "本体",
  "ボディ",
  "body only",
  "body-only",
  "laptop",
  "notebook",
  "ノートpc",
  "ノートパソコン",
  "camera",
  "カメラ本体",
  "単体",
  "単品",
  "メイン機",
];

const BUNDLE_KEYWORDS = [
  "kit",
  "キット",
  "セット",
  "set",
  "レンズキット",
  "ダブルズーム",
  "トリプルズーム",
  "お買い得セット",
  "スターターキット",
  "同梱",
];

const ACCESSORY_KEYWORDS = [
  "ケース",
  "カバー",
  "ストラップ",
  "充電器",
  "チャージャー",
  "バッテリー",
  "保護フィルム",
  "保護ガラス",
  "レンズフィルター",
  "フィルター",
  "アダプタ",
  "adapter",
  "メモリ",
  "ssd",
  "hdd",
  "acアダプタ",
  "電源アダプタ",
  "替え",
  "予備",
  "互換",
  "専用ケース",
  "ショルダー",
  "バッグ",
  "ポーチ",
  "ホルダー",
  "マウント",
  "三脚",
  "リモコン",
  "ケーブル",
  "dock",
  "ドック",
  "周辺",
  "アクセサリ",
  "accessory",
  "for ",
  "対応",
  "専用",
];

const OPTIONAL_QUERY_TOKENS = new Set(["gen", "generation", "carbon", "pro", "max", "plus", "mini", "lite", "ultra"]);

function toHalfWidth(value: string) {
  return value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

export function normalizeQueryText(value: string) {
  return toHalfWidth(value)
    .toLowerCase()
    .replace(/[()（）\[\]【】]/g, " ")
    .replace(/[-_/・]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSearchModeSuffix(query: string) {
  return query.replace(/\s*(中古|新品)\s*$/gi, "").trim();
}

function tokenize(normalized: string) {
  return normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function isSignificantToken(token: string) {
  return /[a-z0-9]/i.test(token) && token.length >= 2;
}

export function buildQuerySignature(query: string, maker?: string): QuerySignature {
  const original = query.trim();
  const base = stripSearchModeSuffix(original);
  const normalized = normalizeQueryText(base);
  const tokens = tokenize(normalized).filter(isSignificantToken);

  const normalizedMaker = maker ? normalizeQueryText(maker) : "";
  const makerToken = normalizedMaker && normalizedMaker.length >= 2 ? normalizedMaker : "";

  const required: string[] = [];
  const optional: string[] = [];

  if (makerToken && !tokens.includes(makerToken)) {
    required.push(makerToken);
  }

  for (const token of tokens) {
    if (OPTIONAL_QUERY_TOKENS.has(token)) {
      optional.push(token);
    } else if (required.length < 4) {
      required.push(token);
    } else {
      optional.push(token);
    }
  }

  if (!required.length && tokens.length) {
    required.push(...tokens.slice(0, 2));
    optional.push(...tokens.slice(2));
  }

  return {
    original,
    normalized,
    requiredTokens: [...new Set(required)],
    optionalTokens: [...new Set(optional)],
    maker: maker?.trim() || undefined,
  };
}

function normalizeTitleText(title: string) {
  return normalizeQueryText(title);
}

function containsKeyword(text: string, keywords: string[]) {
  return keywords.some((kw) => text.includes(kw));
}

export function classifyItemType(title: string): ItemType {
  const text = normalizeTitleText(title);
  if (containsKeyword(text, ACCESSORY_KEYWORDS)) return "accessory";
  if (containsKeyword(text, BUNDLE_KEYWORDS)) return "bundle";
  if (containsKeyword(text, MAIN_KEYWORDS)) return "main";
  return "unknown";
}

function hasModelToken(tokens: string[]) {
  return tokens.some((t) => /\d/.test(t) && /[a-z]/i.test(t));
}

function modelExactHit(titleNorm: string, signature: QuerySignature) {
  const modelTokens = signature.requiredTokens.filter((t) => /\d/.test(t));
  if (!modelTokens.length) return false;
  return modelTokens.every((t) => titleNorm.includes(t));
}

function requiredTokenHitRate(titleNorm: string, requiredTokens: string[]) {
  if (!requiredTokens.length) return 1;
  const hits = requiredTokens.filter((t) => titleNorm.includes(t)).length;
  return hits / requiredTokens.length;
}

function scoreItemTypeComponent(itemType: ItemType): number {
  switch (itemType) {
    case "main":
      return 35;
    case "bundle":
      return 5;
    case "accessory":
      return -85;
    default:
      return -15;
  }
}

export function buildReasons(input: {
  itemType: ItemType;
  requiredTokenHitRate: number;
  modelExact: boolean;
  makerHit: boolean;
  titleNorm: string;
  included: boolean;
  total: number;
}): string[] {
  const reasons: string[] = [];
  if (input.requiredTokenHitRate < 1) reasons.push("required_token_miss");
  if (!input.modelExact) reasons.push("model_inexact");
  if (input.itemType === "accessory") reasons.push("accessory_keyword");
  if (input.itemType === "bundle") reasons.push("bundle_keyword");
  if (input.itemType === "unknown") reasons.push("item_type_unknown");
  if (input.itemType === "main" && containsKeyword(input.titleNorm, MAIN_KEYWORDS)) {
    reasons.push("main_keyword");
  }
  if (input.makerHit) reasons.push("maker_hit");
  if (input.modelExact) reasons.push("model_exact");
  if (!input.included) {
    if (input.itemType !== "main") reasons.push("excluded_not_main");
    else if (input.total < INCLUSION_SCORE_THRESHOLD) reasons.push("below_score_threshold");
    else reasons.push("excluded_by_rule");
  }
  return [...new Set(reasons)];
}

export function scoreListing(
  title: string,
  price: number,
  url: string,
  site: PriceSite,
  signature: QuerySignature,
): ScoredListing {
  const titleNorm = normalizeTitleText(title || "");
  const hitRate = requiredTokenHitRate(titleNorm, signature.requiredTokens);
  let itemType = classifyItemType(title || "");
  if (
    itemType === "unknown" &&
    hitRate >= 1 &&
    !containsKeyword(titleNorm, ACCESSORY_KEYWORDS) &&
    !containsKeyword(titleNorm, BUNDLE_KEYWORDS)
  ) {
    itemType = "main";
  }
  const modelExact = modelExactHit(titleNorm, signature);
  const makerHit = signature.maker
    ? titleNorm.includes(normalizeQueryText(signature.maker))
  : false;

  let coreMatch = Math.round(hitRate * 55);
  if (modelExact) coreMatch += 25;
  if (makerHit) coreMatch += 15;
  coreMatch = Math.min(100, coreMatch);

  const itemTypeScore = scoreItemTypeComponent(itemType);

  let noise = 0;
  if (hitRate < 0.5) noise += 35;
  if (hitRate < 1) noise += 15;
  if (itemType === "accessory") noise += 40;
  if (itemType === "unknown") noise += 10;
  if (containsKeyword(titleNorm, ACCESSORY_KEYWORDS) && itemType !== "accessory") noise += 20;
  noise = Math.min(100, noise);

  const total = coreMatch + itemTypeScore - noise;

  const included = itemType === "main" && total >= INCLUSION_SCORE_THRESHOLD;

  const reasons = buildReasons({
    itemType,
    requiredTokenHitRate: hitRate,
    modelExact,
    makerHit,
    titleNorm,
    included,
    total,
  });

  return {
    title: title || "",
    price,
    url,
    site,
    match: {
      requiredTokenHitRate: hitRate,
      modelExact,
      makerHit,
    },
    itemType,
    scores: {
      coreMatch,
      itemType: itemTypeScore,
      noise,
      total,
    },
    reasons,
    included,
  };
}

export function resolveIncludedForMode(
  listing: Pick<ScoredListing, "itemType" | "scores" | "included">,
  mainOnly: boolean,
): boolean {
  if (mainOnly) {
    return listing.itemType === "main" && listing.scores.total >= INCLUSION_SCORE_THRESHOLD;
  }
  return (
    (listing.itemType === "main" || listing.itemType === "bundle") &&
    listing.scores.total >= INCLUSION_SCORE_THRESHOLD
  );
}

export function trimPricesForStats(prices: number[]): number[] {
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

function filterByMaker<T extends { title?: string }>(points: T[], maker?: string) {
  if (!maker?.trim()) return { points, makerFilterApplied: false };
  const normalizedMaker = normalizeQueryText(maker).replace(/\s+/g, "");
  const filtered = points.filter((p) =>
    normalizeTitleText(p.title || "").replace(/\s+/g, "").includes(normalizedMaker),
  );
  return {
    points: filtered.length ? filtered : points,
    makerFilterApplied: filtered.length > 0,
  };
}

export function scoreAndSummarizeListings(
  points: Array<{ price: number; url?: string; title?: string }>,
  query: string,
  site: PriceSite,
  maker?: string,
  fallbackSearchUrl?: string,
) {
  if (!points.length) return null;

  const { points: usedPoints, makerFilterApplied } = filterByMaker(points, maker);
  const signature = buildQuerySignature(query, maker);
  const scored = usedPoints
    .filter((p) => p.price > 0)
    .map((p) =>
      scoreListing(
        p.title || "",
        p.price,
        p.url || fallbackSearchUrl || "",
        site,
        signature,
      ),
    )
    .sort((a, b) => a.price - b.price);

  const includedPrices = trimPricesForStats(
    scored.filter((s) => s.included).map((s) => s.price),
  );

  if (!includedPrices.length) {
    const validPrices = trimPricesForStats(scored.map((s) => s.price));
    const stats = calcStatsFromPrices(validPrices);
    if (!stats) return null;
    const minItem = scored.find((s) => s.price === stats.min) || scored[0];
    return {
      items: scored.map((s) => ({
        title: s.title,
        price: s.price,
        url: s.url,
        site: s.site,
        itemType: s.itemType,
        included: s.included,
        score: s.scores.total,
        reasons: s.reasons,
      })),
      ...stats,
      currency: "JPY",
      minUrl: minItem?.url,
      minTitle: minItem?.title,
      makerFilterApplied,
      matchingQuery: signature.normalized,
    };
  }

  const stats = calcStatsFromPrices(includedPrices)!;
  const minItem = scored.find((s) => s.included && s.price === stats.min) || scored.find((s) => s.price === stats.min) || scored[0];

  return {
    items: scored.map((s) => ({
      title: s.title,
      price: s.price,
      url: s.url,
      site: s.site,
      itemType: s.itemType,
      included: s.included,
      score: s.scores.total,
      reasons: s.reasons,
    })),
    ...stats,
    currency: "JPY",
    minUrl: minItem?.url,
    minTitle: minItem?.title,
    makerFilterApplied,
    matchingQuery: signature.normalized,
  };
}
