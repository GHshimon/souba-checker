import type { Env } from "./helpers";
import { error } from "./helpers";

/**
 * 収集ワーカー(レイヤーB)の書き込み認可。
 * INGEST_TOKEN 未設定なら取込機能自体を無効化（誤って公開書き込みにしない）。
 */
export function requireIngestAuth(request: Request, env: Env): Response | null {
  const expected = env.INGEST_TOKEN?.trim();
  if (!expected) return error("INGEST_TOKEN が未設定のため取込は無効です", 503);
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token && token === expected) return null;
  return error("取込トークンが必要です", 401);
}
