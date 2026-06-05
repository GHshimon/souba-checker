import type { Env } from "../_utils/helpers";
import { scoreAndSummarizeListings } from "./price-matching";

type PricePoint = {
  price: number;
  url?: string;
  title?: string;
};

const IDENTIFY_PROMPT = `あなたはせどり業者向けの商品特定AIです。
与えられた複数の写真から、写っている商品を同一商品/別商品で整理して列挙してください。

優先順位：
1. 製品ラベル/シールに記載の型番（最重要）
2. 製品本体の刻印・印字
3. パッケージのバーコード/JANコード
4. 製品の外観・色・形状

不確実な場合は confidence を "low" にし、何が不足しているか missing_info に記載してください。

純粋なJSONのみで回答してください。説明文・コードブロックは禁止です。
{"products":[{"product_name":"ブランド名と製品名と型番","brand":"メーカー","model":"型番","category":"カテゴリ","jan_code":"JANコードまたはnull","search_query":"中古検索用キーワード（日本語）","confidence":"high または medium または low","missing_info":"不足情報またはnull"}]}`;

const SIMILAR_PROMPT = `あなたは型番照合アシスタントです。
入力商品の誤検出を防ぐため、混同しやすい類似商品を列挙してください。

以下の難しさを必ず反映:
- シリーズ違い（例: Mark II, Gen2）
- 容量/色違い
- キット/オプション違い（ボディ単体、レンズキット等）
- 地域型番差

JSONのみで回答:
{"similar_products":[{"name":"商品名","brand":"メーカー","model":"型番","relation_type":"successor|variant|option|bundle|similar","difference_points":["差分1","差分2"],"risk_note":"誤検出リスク","search_query":"検索用語"}]}`;

function extractJSON(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try {
      return JSON.parse(raw.slice(s, e + 1));
    } catch {
      /* continue */
    }
  }
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

/** @see https://zenn.dev/chameleonmeme/articles/6714630ff456d7 — 2.0系廃止に伴い 2.5 安定版へ移行 */
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

function resolveGeminiModels(env: Env): string[] {
  if (env.GEMINI_MODEL) return [env.GEMINI_MODEL];
  return GEMINI_MODEL_FALLBACKS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("外部API呼び出しがタイムアウトしました");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function isQuotaError(message: string) {
  return /quota exceeded|rate limit|resource exhausted|429|high demand/i.test(message);
}

function formatGeminiError(message: string) {
  if (/high demand|temporar(?:y|ily)|try again later/i.test(message)) {
    return "Gemini側が混雑中です。しばらく待ってから再試行してください。";
  }
  if (isQuotaError(message)) {
    const retry = message.match(/retry in ([\d.]+)s/i);
    const sec = retry ? Math.ceil(Number(retry[1])) : null;
    return sec
      ? `Gemini無料枠の上限に達しました。約${sec}秒後に再試行するか、Google AI Studioで利用状況を確認してください。`
      : "Gemini無料枠の上限に達しました。Google AI Studio (https://aistudio.google.com/) でAPIキーと利用状況を確認してください。";
  }
  return message;
}

async function callGeminiModel(model: string, apiKey: string, parts: unknown[]) {
  const resp = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
    55000,
  );

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string; status?: string };
  };

  if (!resp.ok) {
    const message = data.error?.message || `Gemini API error (${resp.status})`;
    const err = new Error(message) as Error & { quota?: boolean; retryMs?: number };
    err.quota = isQuotaError(message);
    const retry = message.match(/retry in ([\d.]+)s/i);
    if (retry) err.retryMs = Math.ceil(Number(retry[1]) * 1000);
    throw err;
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  const parsed = extractJSON(text);
  if (!parsed) throw new Error("Gemini応答のJSON解析に失敗しました");
  return parsed;
}

export async function identifyWithGemini(images: string[], env: Env, jan?: string) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");

  const janHint = jan
    ? `\n\n補足: バーコードから JAN ${jan} を検出済みです。可能なら jan_code に含め、search_query も精度高く作成してください。`
    : "";

  const parts = [
    ...images.map((data) => ({
      inline_data: { mime_type: "image/jpeg", data },
    })),
    { text: IDENTIFY_PROMPT + janHint },
  ];

  const models = resolveGeminiModels(env);
  let lastMessage = "Gemini API error";
  let parsed: unknown = null;

  for (const model of models) {
    try {
      parsed = await callGeminiModel(model, apiKey, parts);
      break;
    } catch (e) {
      const err = e as Error & { quota?: boolean; retryMs?: number };
      lastMessage = err.message || lastMessage;

      if (err.quota && err.retryMs && err.retryMs <= 20000) {
        await sleep(err.retryMs + 500);
        try {
          return await callGeminiModel(model, apiKey, parts);
        } catch (retryErr) {
          lastMessage = (retryErr as Error).message || lastMessage;
        }
      } else if (isQuotaError(lastMessage)) {
        // "high demand" のように retry-in 秒が返らない混雑時に短時間の再試行を1回実施
        await sleep(8000);
        try {
          parsed = await callGeminiModel(model, apiKey, parts);
          break;
        } catch (retryErr) {
          lastMessage = (retryErr as Error).message || lastMessage;
        }
      }

      if (!isQuotaError(lastMessage)) {
        throw new Error(formatGeminiError(lastMessage));
      }
    }
  }
  if (!parsed) throw new Error(formatGeminiError(lastMessage));
  const products = normalizeIdentifyProducts(parsed);
  if (!products.length) throw new Error("Gemini応答から商品リストを作成できませんでした");
  return { products };
}

function normalizeIdentifyProducts(raw: unknown) {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const productsRaw = Array.isArray(obj.products)
    ? obj.products
    : obj.product_name
      ? [obj]
      : [];

  return productsRaw
    .map((item) => {
      const p = item as Record<string, unknown>;
      const productName = String(p.product_name || "").trim();
      if (!productName) return null;
      return {
        product_name: productName,
        brand: p.brand ? String(p.brand) : undefined,
        model: p.model ? String(p.model) : undefined,
        category: p.category ? String(p.category) : undefined,
        jan_code: p.jan_code ? String(p.jan_code) : undefined,
        search_query: p.search_query ? String(p.search_query) : productName,
        confidence: (p.confidence === "high" || p.confidence === "medium" || p.confidence === "low" ? p.confidence : "low") as
          | "high"
          | "medium"
          | "low",
        missing_info: p.missing_info ? String(p.missing_info) : undefined,
      };
    })
    .filter(Boolean)
    .slice(0, 8) as Array<{
    product_name: string;
    brand?: string;
    model?: string;
    category?: string;
    jan_code?: string;
    search_query: string;
    confidence: "high" | "medium" | "low";
    missing_info?: string;
  }>;
}

function buildProductLinks(query: string) {
  const q = encodeURIComponent(query);
  return {
    rakuten: `https://search.rakuten.co.jp/search/mall/${q}/`,
    yahooShopping: `https://shopping.yahoo.co.jp/search?p=${q}`,
    googleImages: `https://www.google.com/search?tbm=isch&q=${q}`,
  };
}

export async function listSimilarProducts(
  base: {
    product_name: string;
    brand?: string;
    model?: string;
    category?: string;
    search_query?: string;
  },
  env: Env,
) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");
  const models = resolveGeminiModels(env);
  const userText = [
    `対象商品: ${base.product_name}`,
    base.brand ? `ブランド: ${base.brand}` : null,
    base.model ? `型番: ${base.model}` : null,
    base.category ? `カテゴリ: ${base.category}` : null,
    base.search_query ? `検索語: ${base.search_query}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let parsed: unknown = null;
  let lastMessage = "Gemini API error";
  for (const model of models) {
    try {
      parsed = await callGeminiModel(model, apiKey, [{ text: `${SIMILAR_PROMPT}\n\n${userText}` }]);
      break;
    } catch (e) {
      const err = e as Error;
      lastMessage = err.message || lastMessage;
    }
  }
  if (!parsed) throw new Error(formatGeminiError(lastMessage));

  const similarRaw = (parsed as Record<string, unknown>).similar_products;
  const similar = (Array.isArray(similarRaw) ? similarRaw : [])
    .map((item) => {
      const p = item as Record<string, unknown>;
      const name = String(p.name || "").trim();
      if (!name) return null;
      const searchQuery = String(p.search_query || name).trim();
      return {
        name,
        brand: p.brand ? String(p.brand) : undefined,
        model: p.model ? String(p.model) : undefined,
        relationType: p.relation_type ? String(p.relation_type) : undefined,
        differencePoints: Array.isArray(p.difference_points) ? p.difference_points.map((v) => String(v)) : [],
        riskNote: p.risk_note ? String(p.risk_note) : undefined,
        searchQuery,
        links: buildProductLinks(searchQuery),
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  return {
    base_product: base,
    similar_products: similar,
  };
}

export async function lookupJanWithYahoo(jan: string, env: Env) {
  const clientId = env.YAHOO_CLIENT_ID;
  if (!clientId) throw new Error("YAHOO_CLIENT_ID が未設定です");

  const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  url.searchParams.set("appid", clientId);
  url.searchParams.set("jan_code", jan);
  url.searchParams.set("results", "1");

  const resp = await fetch(url.toString());
  const data = (await resp.json()) as {
    hits?: Array<{ name?: string; image?: { medium?: string } }>;
    error?: { message?: string };
  };

  if (!resp.ok) throw new Error(data.error?.message || `Yahoo API error (${resp.status})`);

  const hit = data.hits?.[0];
  if (!hit?.name) {
    return { name: `JAN: ${jan}`, jan };
  }

  return {
    name: hit.name,
    jan,
    imageUrl: hit.image?.medium,
  };
}

export async function fetchRakutenPrices(query: string, env: Env, maker?: string) {
  const appId = env.RAKUTEN_APP_ID;
  const accessKey = env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) return null;

  const referer = env.RAKUTEN_REFERER || "http://127.0.0.1:8788";

  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401");
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("keyword", query);
  url.searchParams.set("hits", "30");
  url.searchParams.set("sort", "+itemPrice");

  const resp = await fetch(url.toString(), {
    // Some runtimes ignore manual Referer headers; use fetch referrer fields first.
    referrer: referer,
    referrerPolicy: "origin",
    headers: {
      Origin: referer.replace(/\/$/, ""),
    },
  });
  const data = (await resp.json()) as {
    items?: Array<{ itemPrice?: number; itemUrl?: string; itemName?: string }>;
    Items?: Array<{ itemPrice?: number; Item?: { itemPrice?: number; itemUrl?: string; itemName?: string } }>;
    error?: string;
    errors?: { errorMessage?: string } | Array<{ message?: string }>;
  };

  if (!resp.ok) {
    const msg =
      data.error ||
      (Array.isArray(data.errors) ? data.errors[0]?.message : data.errors?.errorMessage) ||
      `Rakuten API error (${resp.status})`;
    throw new Error(msg);
  }

  const points: PricePoint[] = [
    ...(data.items || []).map((i) => ({
      price: i.itemPrice ?? 0,
      url: i.itemUrl,
      title: i.itemName,
    })),
    ...(data.Items || []).map((i) => ({
      price: i.itemPrice ?? i.Item?.itemPrice ?? 0,
      url: i.Item?.itemUrl,
      title: i.Item?.itemName,
    })),
  ].filter((p) => p.price > 0);

  return summarizePricePoints(points, query, "rakuten", maker);
}

export async function fetchYahooShoppingPrices(query: string, env: Env, maker?: string) {
  const clientId = env.YAHOO_CLIENT_ID;
  if (!clientId) return null;

  const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  url.searchParams.set("appid", clientId);
  url.searchParams.set("query", query);
  url.searchParams.set("results", "30");
  url.searchParams.set("sort", "+price");

  const resp = await fetch(url.toString());
  const data = (await resp.json()) as {
    hits?: Array<{
      name?: string;
      url?: string;
      price?: number;
      priceLabel?: { defaultPrice?: number; discountedPrice?: number | null };
    }>;
    error?: { message?: string };
  };

  if (!resp.ok) {
    throw new Error(data.error?.message || `Yahoo Shopping API error (${resp.status})`);
  }

  const points: PricePoint[] = (data.hits || [])
    .map((hit) => ({
      price: hit.priceLabel?.discountedPrice ?? hit.priceLabel?.defaultPrice ?? hit.price ?? 0,
      url: hit.url,
      title: hit.name,
    }))
    .filter((p) => p.price > 0);

  const fallbackSearchUrl = `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(query)}`;
  return scoreAndSummarizeListings(points, query, "yahooShopping", maker, fallbackSearchUrl);
}
