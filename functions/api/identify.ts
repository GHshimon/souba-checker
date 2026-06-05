import { identifyWithGemini } from "../_utils/api-clients";
import { error, json, parseBody } from "../_utils/helpers";

interface IdentifyRequest {
  images: string[];
  jan?: string;
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await parseBody<IdentifyRequest>(context.request);
    if (!body.images?.length) return error("images が必要です");

    const result = await identifyWithGemini(body.images.slice(0, 3), context.env, body.jan);
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "identify failed", 500);
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
