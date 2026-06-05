import { json, parseBody } from "../../_utils/helpers";
import { isWorkspaceAuthRequired, requireWorkspaceAuth, workspaceCorsHeaders } from "../../_utils/workspace-auth";

interface AuthRequest {
  password?: string;
}

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await parseBody<AuthRequest>(context.request);
    const expected = context.env.WORKSPACE_PASSWORD?.trim();
    if (!expected) {
      return json({ ok: true, authRequired: false, message: "認証は無効です（開発モード）" });
    }
    if ((body.password || "").trim() !== expected) {
      return json({ error: "パスワードが正しくありません" }, 401);
    }
    return json({ ok: true, authRequired: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "auth failed" }, 500);
  }
};

export const onRequestGet: PagesFunction = async (context) => {
  return json({ authRequired: isWorkspaceAuthRequired(context.env) });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: workspaceCorsHeaders() });
};
