import { fetchRakutenPrices, fetchYahooShoppingPrices } from "../_utils/api-clients";
import { error, json, parseBody } from "../_utils/helpers";

interface PricesRequest {
  query: string;
  maker?: string;
}

type SearchMode = "new" | "used";

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

async function fetchWithFallback(
  query: string,
  mode: SearchMode,
  maker: string | undefined,
  fetcher: (
    q: string,
    env: Parameters<typeof fetchRakutenPrices>[1],
    maker?: string,
  ) => Promise<Awaited<ReturnType<typeof fetchRakutenPrices>>>,
  env: Parameters<typeof fetchRakutenPrices>[1],
) {
  const candidates = buildModeCandidates(query, mode);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await fetcher(candidate, env, maker);
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

    const rakuten = rakutenNewResult.status === "fulfilled" ? rakutenNewResult.value.result : null;
    const yahooShopping = yahooNewResult.status === "fulfilled" ? yahooNewResult.value.result : null;
    const rakutenUsed = rakutenUsedResult.status === "fulfilled" ? rakutenUsedResult.value.result : null;
    const yahooShoppingUsed = yahooUsedResult.status === "fulfilled" ? yahooUsedResult.value.result : null;
    const warnings = [
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
