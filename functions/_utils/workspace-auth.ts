import type { Env } from "./helpers";
import { error } from "./helpers";

export function isWorkspaceAuthRequired(env: Env) {
  return Boolean(env.WORKSPACE_PASSWORD?.trim());
}

export function requireWorkspaceAuth(request: Request, env: Env): Response | null {
  if (!isWorkspaceAuthRequired(env)) return null;
  const expected = env.WORKSPACE_PASSWORD!.trim();
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token && token === expected) return null;
  return error("ワークスペース認証が必要です", 401);
}

export function workspaceCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
