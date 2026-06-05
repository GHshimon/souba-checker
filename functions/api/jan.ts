import { lookupJanWithYahoo } from "../_utils/api-clients";
import { error, json, parseBody } from "../_utils/helpers";

interface JanRequest {
  jan: string;
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await parseBody<JanRequest>(context.request);
    if (!body.jan) return error("jan が必要です");

    const result = await lookupJanWithYahoo(body.jan, context.env);
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "jan lookup failed", 500);
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
