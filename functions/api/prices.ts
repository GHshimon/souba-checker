import { fetchRakutenPrices, fetchYahooShoppingPrices } from "../_utils/api-clients";
import { applyReferencePriceFloor } from "../_utils/price-matching";
import { error, json, parseBody } from "../_utils/helpers";

interface PricesRequest {
  query: string;
  maker?: string;
}

type SearchMode = "new" | "used";

type PriceSummary = {
  median?: number;
  min?: number;
  max?: number;
  avg?: number;
  count?: number;
} | null;

function buildQueryCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const normalized = trimmed
    .replace(/[()（）\[\]【】]/g, " ")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter(Boolean);
  const significant = tokens.filter((t) => t.length >= 2);
  const compact3 = significant.slice(0, 3).join(" ").trim();
  const compact2 = significant.slice(0, 2).join(" ").trim();

  return [...new Set([trimmed, normalized, compact3, compact2].filter(Boolean))];
}

function buildModeCandidates(raw: string, mode: SearchMode): string[] {
  const base = buildQueryCandidates(raw);
  if (mode === "used") {
    return [...new Set(base.map((q) => `${q} 中古`).filter(Boolean))];
  }
  return [...new Set([`${base[0]} 新品`, ...base].filter(Boolean))];
}

function getReferenceMedian(...summaries: PriceSummary[]): number | undefined {
  const values = summaries
    .map((summary) => summary?.median)
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (!values.length) return undefined;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function fetchWithFallback(
  query: string,
  mode: SearchMode,
  maker: string | undefined,
  fetcher: (
    q: string,
    env: Parameters<typeof fetchRakutenPrices>[1],
    maker?: string,
    options?: { availableOnly?: boolean },
  ) => Promise<Awaited<ReturnType<typeof fetchRakutenPrices>>>,
  env: Parameters<typeof fetchRakutenPrices>[1],
) {
  const candidates = buildModeCandidates(query, mode);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await fetcher(candidate, env, maker, { availableOnly: true });
      if (result) return { result, usedQuery: candidate, errors };
    } catch (e) {
      errors.push(String((e as Error)?.message || e));
    }
  }
  return { result: null, usedQuery: candidates[0], errors };
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await parseBody<PricesRequest>(context.request);
    if (!body.query?.trim()) return error("query が必要です");

    const [
      rakutenNewResult,
      yahooNewResult,
      rakutenUsedResult,
      yahooUsedResult,
    ] = await Promise.allSettled([
      fetchWithFallback(body.query, "new", body.maker, fetchRakutenPrices, context.env),
      fetchWithFallback(body.query, "new", body.maker, fetchYahooShoppingPrices, context.env),
      fetchWithFallback(body.query, "used", body.maker, fetchRakutenPrices, context.env),
      fetchWithFallback(body.query, "used", body.maker, fetchYahooShoppingPrices, context.env),
    ]);

    let rakuten = rakutenNewResult.status === "fulfilled" ? rakutenNewResult.value.result : null;
    let yahooShopping = yahooNewResult.status === "fulfilled" ? yahooNewResult.value.result : null;
    const rakutenUsed = rakutenUsedResult.status === "fulfilled" ? rakutenUsedResult.value.result : null;
    const yahooShoppingUsed = yahooUsedResult.status === "fulfilled" ? yahooUsedResult.value.result : null;

    const usedReferenceMedian = getReferenceMedian(rakutenUsed, yahooShoppingUsed);
    if (usedReferenceMedian) {
      rakuten = applyReferencePriceFloor(rakuten, usedReferenceMedian);
      yahooShopping = applyReferencePriceFloor(yahooShopping, usedReferenceMedian);
    }

    const newSuspiciouslyLow =
      usedReferenceMedian &&
      [rakuten?.median, yahooShopping?.median].some(
        (median) => typeof median === "number" && median > 0 && median < usedReferenceMedian * 0.45,
      );

    const warnings = [
      "参考価格は各APIの販売中商品から本体候補を集計しています（落札済み/SOLD OUT相場ではありません）",
      rakutenNewResult.status === "rejected"
        ? `rakuten(new): ${String(rakutenNewResult.reason?.message || rakutenNewResult.reason)}`
        : rakutenNewResult.value.errors.length
          ? `rakuten(new): ${rakutenNewResult.value.errors.join(" / ")}`
          : null,
      yahooNewResult.status === "rejected"
        ? `yahoo_shopping(new): ${String(yahooNewResult.reason?.message || yahooNewResult.reason)}`
        : yahooNewResult.value.errors.length
          ? `yahoo_shopping(new): ${yahooNewResult.value.errors.join(" / ")}`
          : null,
      rakutenUsedResult.status === "rejected"
        ? `rakuten(used): ${String(rakutenUsedResult.reason?.message || rakutenUsedResult.reason)}`
        : rakutenUsedResult.value.errors.length
          ? `rakuten(used): ${rakutenUsedResult.value.errors.join(" / ")}`
          : null,
      yahooUsedResult.status === "rejected"
        ? `yahoo_shopping(used): ${String(yahooUsedResult.reason?.message || yahooUsedResult.reason)}`
        : yahooUsedResult.value.errors.length
          ? `yahoo_shopping(used): ${yahooUsedResult.value.errors.join(" / ")}`
          : null,
      newSuspiciouslyLow
        ? "新品参考が中古参考より大幅に安いため、周辺品混入の可能性があります。検索一覧で確認してください"
        : null,
      !rakuten && !yahooShopping && !rakutenUsed && !yahooShoppingUsed
        ? `価格ヒットなし: query="${body.query}"`
        : null,
    ].filter(Boolean);

    return json({
      rakuten,
      yahooShopping,
      rakutenUsed,
      yahooShoppingUsed,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "prices failed", 500);
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
