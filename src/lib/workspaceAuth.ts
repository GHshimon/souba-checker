const STORAGE_KEY = "souba_workspace_token";

export function getWorkspaceToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setWorkspaceToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearWorkspaceToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchWorkspaceAuthStatus() {
  const resp = await fetch("/api/workspace/auth");
  const data = (await resp.json()) as { authRequired?: boolean };
  return Boolean(data.authRequired);
}

export async function loginWorkspace(password: string) {
  const resp = await fetch("/api/workspace/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = (await resp.json()) as { ok?: boolean; error?: string };
  if (!resp.ok) throw new Error(data.error || "ログインに失敗しました");
  setWorkspaceToken(password.trim());
}
