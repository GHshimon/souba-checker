export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  RAKUTEN_APP_ID?: string;
  RAKUTEN_ACCESS_KEY?: string;
  RAKUTEN_REFERER?: string;
  YAHOO_CLIENT_ID?: string;
  WORKSPACE_PASSWORD?: string;
  /** 収集ワーカー(レイヤーB)が /api/ingest に書き込むための専用トークン。未設定なら取込は無効 */
  INGEST_TOKEN?: string;
  DB?: D1Database;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function parseBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function calcPriceSummary(prices: number[]) {
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  return { min, max, avg, count: prices.length, currency: "JPY" };
}
