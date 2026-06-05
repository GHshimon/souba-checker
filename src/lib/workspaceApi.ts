import { getWorkspaceToken } from "./workspaceAuth";
import type { AggregationReport, WatchlistItem } from "../types";

function workspaceHeaders() {
  const token = getWorkspaceToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function workspaceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: { ...workspaceHeaders(), ...init?.headers },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data as { error?: string }).error || `API error (${resp.status})`);
  }
  return data as T;
}

export async function fetchWorkspaceWatchlist() {
  const data = await workspaceFetch<{ watchlist: WatchlistItem[] }>("/api/workspace/watchlist");
  return data.watchlist;
}

export async function enqueueWorkspaceWatchlistAdd(item: WatchlistItem) {
  return workspaceFetch<{ watchlist: WatchlistItem[]; opId: string; status: string }>(
    "/api/workspace/watchlist",
    {
      method: "POST",
      body: JSON.stringify({
        action: "add",
        item,
      }),
    },
  );
}

export async function enqueueWorkspaceWatchlistDelete(id: string) {
  return workspaceFetch<{ watchlist: WatchlistItem[]; opId: string; status: string }>(
    "/api/workspace/watchlist",
    {
      method: "POST",
      body: JSON.stringify({ action: "delete", id }),
    },
  );
}

export async function fetchWorkspaceReports(limit = 400) {
  const data = await workspaceFetch<{ reports: AggregationReport[] }>(
    `/api/workspace/reports?limit=${limit}`,
  );
  return data.reports;
}

export async function saveWorkspaceReport(report: AggregationReport) {
  const data = await workspaceFetch<{ reports: AggregationReport[] }>("/api/workspace/reports", {
    method: "POST",
    body: JSON.stringify({ report }),
  });
  return data.reports;
}
