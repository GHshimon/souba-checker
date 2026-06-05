import { listSimilarProducts } from "../_utils/api-clients";
import { error, json, parseBody } from "../_utils/helpers";

interface SimilarRequest {
  product_name: string;
  brand?: string;
  model?: string;
  category?: string;
  search_query?: string;
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await parseBody<SimilarRequest>(context.request);
    if (!body.product_name?.trim()) return error("product_name が必要です");
    const result = await listSimilarProducts(
      {
        product_name: body.product_name.trim(),
        brand: body.brand?.trim(),
        model: body.model?.trim(),
        category: body.category?.trim(),
        search_query: body.search_query?.trim(),
      },
      context.env,
    );
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "similar failed", 500);
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
