import { error, json, parseBody } from "../../_utils/helpers";
import { requireWorkspaceAuth, workspaceCorsHeaders } from "../../_utils/workspace-auth";
import { enqueueWatchlistOp, listReports, saveReportRecord } from "../../_utils/workspace-db";

interface ReportRequest {
  report: {
    id: string;
    watchlistId: string;
    watchlistName: string;
    category: string;
    frequency: "weekly";
    runAt: number;
    prices: unknown;
  };
}

export const onRequestGet: PagesFunction = async (context) => {
  const denied = requireWorkspaceAuth(context.request, context.env);
  if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const limit = Number(url.searchParams.get("limit") || "400");
    const reports = await listReports(context.env, Number.isFinite(limit) ? limit : 400);
    return json({ reports });
  } catch (e) {
    return error(e instanceof Error ? e.message : "reports load failed", 500);
  }
};

export const onRequestPost: PagesFunction = async (context) => {
  const denied = requireWorkspaceAuth(context.request, context.env);
  if (denied) return denied;
  try {
    const body = await parseBody<ReportRequest>(context.request);
    if (!body.report?.id || !body.report.watchlistId) {
      return error("report が不正です");
    }
    await saveReportRecord(context.env, body.report);
    await enqueueWatchlistOp(context.env, "touch", {
      id: body.report.watchlistId,
      lastAggregatedAt: body.report.runAt,
    });
    const reports = await listReports(context.env, 400);
    return json({ ok: true, reports });
  } catch (e) {
    return error(e instanceof Error ? e.message : "report save failed", 500);
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: workspaceCorsHeaders() });
};
