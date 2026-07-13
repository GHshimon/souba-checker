import type { AggregationReport, WatchlistItem } from "../types";

export type WatchlistSort = "name" | "category" | "lastRun" | "created" | "due";
export type ReportSort = "runAtDesc" | "runAtAsc" | "name" | "category";

export type ListFilterState = {
  search: string;
  category: string;
};

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(text: string, search: string) {
  if (!search) return true;
  return text.toLowerCase().includes(search);
}

export function collectCategories(watchlist: WatchlistItem[], reports: AggregationReport[]) {
  const set = new Set<string>(["未分類", "PC周辺機器", "ガジェット", "家電", "ゲーム", "本", "日用品"]);
  watchlist.forEach((w) => set.add(w.category));
  reports.forEach((r) => set.add(r.category));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

export function filterWatchlist(
  items: WatchlistItem[],
  filter: ListFilterState,
  sort: WatchlistSort,
  dueOnly: boolean,
  isDue: (item: WatchlistItem) => boolean,
) {
  const search = normalizeSearch(filter.search);
  let rows = items.filter((item) => {
    if (filter.category !== "all" && item.category !== filter.category) return false;
    if (dueOnly && !isDue(item)) return false;
    const haystack = `${item.name} ${item.query} ${item.category}`;
    return matchesSearch(haystack, search);
  });

  rows = [...rows].sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name, "ja");
      case "category":
        return a.category.localeCompare(b.category, "ja") || a.name.localeCompare(b.name, "ja");
      case "lastRun":
        return (b.lastAggregatedAt || 0) - (a.lastAggregatedAt || 0);
      case "created":
        return b.createdAt - a.createdAt;
      case "due":
        return Number(isDue(b)) - Number(isDue(a)) || a.name.localeCompare(b.name, "ja");
      default:
        return 0;
    }
  });

  return rows;
}

export function filterReports(items: AggregationReport[], filter: ListFilterState, sort: ReportSort) {
  const search = normalizeSearch(filter.search);
  let rows = items.filter((item) => {
    if (filter.category !== "all" && item.category !== filter.category) return false;
    const haystack = `${item.watchlistName} ${item.category}`;
    return matchesSearch(haystack, search);
  });

  rows = [...rows].sort((a, b) => {
    switch (sort) {
      case "runAtAsc":
        return a.runAt - b.runAt;
      case "name":
        return a.watchlistName.localeCompare(b.watchlistName, "ja");
      case "category":
        return a.category.localeCompare(b.category, "ja") || b.runAt - a.runAt;
      case "runAtDesc":
      default:
        return b.runAt - a.runAt;
    }
  });

  return rows;
}
