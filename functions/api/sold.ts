import { error, json } from "../_utils/helpers";
import { listSoldStats } from "../_utils/sold-db";
import { requireWorkspaceAuth, workspaceCorsHeaders } from "../_utils/workspace-auth";

// GET /api/sold?key=<match_key>&limit=30
// UI/集計用の読み取り。閲覧はワークスペース認証（設定時）に従う。
export const onRequestGet: PagesFunction = async (context) => {
  const denied = requireWorkspaceAuth(context.request, context.env);
  if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const key = (url.searchParams.get("key") || "").trim();
    if (!key) return error("key が必要です");
    const limitRaw = Number(url.searchParams.get("limit") || "30");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 30;
    const result = await listSoldStats(context.env, key, limit);
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "sold load failed", 500);
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: workspaceCorsHeaders() });
};
