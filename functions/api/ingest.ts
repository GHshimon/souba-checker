import { error, json, parseBody } from "../_utils/helpers";
import { requireIngestAuth } from "../_utils/ingest-auth";
import { ingestSoldStats, type IngestBatch } from "../_utils/sold-db";
import { workspaceCorsHeaders } from "../_utils/workspace-auth";

// POST /api/ingest  { source, batchKey?, items: SoldStatInput[] }
// 収集ワーカー(レイヤーB)が実売相場スナップショットを D1(sold_stats) に投入する。
export const onRequestPost: PagesFunction = async (context) => {
  const denied = requireIngestAuth(context.request, context.env);
  if (denied) return denied;
  try {
    const body = await parseBody<IngestBatch>(context.request);
    if (!body?.source?.trim()) return error("source が必要です");
    if (!Array.isArray(body.items) || !body.items.length) return error("items が必要です");
    const result = await ingestSoldStats(context.env, body);
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "ingest failed", 500);
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: workspaceCorsHeaders() });
};
