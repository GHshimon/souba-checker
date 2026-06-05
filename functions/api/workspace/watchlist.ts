import { error, json, parseBody } from "../../_utils/helpers";
import { requireWorkspaceAuth, workspaceCorsHeaders } from "../../_utils/workspace-auth";
import { enqueueWatchlistOp, listWatchlist } from "../../_utils/workspace-db";

type WatchlistAction =
  | {
      action: "add";
      item: {
        id: string;
        name: string;
        query: string;
        category: string;
        frequency: "weekly";
        createdAt: number;
      };
    }
  | { action: "delete"; id: string }
  | { action: "touch"; id: string; lastAggregatedAt: number };

export const onRequestGet: PagesFunction = async (context) => {
  const denied = requireWorkspaceAuth(context.request, context.env);
  if (denied) return denied;
  try {
    const watchlist = await listWatchlist(context.env);
    return json({ watchlist });
  } catch (e) {
    return error(e instanceof Error ? e.message : "watchlist load failed", 500);
  }
};

export const onRequestPost: PagesFunction = async (context) => {
  const denied = requireWorkspaceAuth(context.request, context.env);
  if (denied) return denied;
  try {
    const body = await parseBody<WatchlistAction>(context.request);
    if (body.action === "add") {
      if (!body.item?.name?.trim() || !body.item?.query?.trim()) {
        return error("name と query が必要です");
      }
      const result = await enqueueWatchlistOp(context.env, "add", { item: body.item });
      return json(result);
    }
    if (body.action === "delete") {
      if (!body.id) return error("id が必要です");
      const result = await enqueueWatchlistOp(context.env, "delete", { id: body.id });
      return json(result);
    }
    if (body.action === "touch") {
      if (!body.id) return error("id が必要です");
      const result = await enqueueWatchlistOp(context.env, "touch", {
        id: body.id,
        lastAggregatedAt: body.lastAggregatedAt,
      });
      return json(result);
    }
    return error("未対応の action です");
  } catch (e) {
    return error(e instanceof Error ? e.message : "watchlist op failed", 500);
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: workspaceCorsHeaders() });
};
