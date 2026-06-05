import { T } from "./constants";
import type { AggregationReport, PricesResponse, WatchlistItem } from "../types";

export const CHART_COLOR_POOL = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be123c",
  "#65a30d",
  "#ca8a04",
  "#4f46e5",
];

export function formatYen(v?: number | null) {
  if (v == null) return "—";
  return `¥${v.toLocaleString("ja-JP")}`;
}

export function formatDay(ts: number) {
  return new Date(ts).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });
}

export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function pickMetric(
  prices: PricesResponse,
  target: "new" | "used",
  metric: "min" | "median" | "avg",
): number | null {
  const a = target === "new" ? prices.rakuten : prices.rakutenUsed;
  const b = target === "new" ? prices.yahooShopping : prices.yahooShoppingUsed;
  return (a?.[metric] ?? b?.[metric]) ?? null;
}

export function buildAggregationChartOption(params: {
  watchlist: WatchlistItem[];
  reports: AggregationReport[];
  selectedWatchIds: string[];
  chartTarget: "new" | "used";
  chartMetric: "min" | "median" | "avg";
  maxPoints: number;
}) {
  const { watchlist, reports, selectedWatchIds, chartTarget, chartMetric, maxPoints } = params;
  const selectedSet = new Set(selectedWatchIds);
  const selectedWatch = watchlist.filter((w) => selectedSet.has(w.id));
  const selectedReports = reports
    .filter((r) => selectedSet.has(r.watchlistId))
    .sort((a, b) => a.runAt - b.runAt);
  const allDays = Array.from(new Set(selectedReports.map((r) => formatDay(r.runAt))));
  const xDays = allDays.slice(Math.max(0, allDays.length - maxPoints));
  const series = selectedWatch
    .map((w, idx) => {
      const perWatch = reports
        .filter((r) => r.watchlistId === w.id)
        .sort((a, b) => a.runAt - b.runAt)
        .map((r) => ({
          day: formatDay(r.runAt),
          value: pickMetric(r.prices, chartTarget, chartMetric),
        }));
      const byDay = new Map(perWatch.map((p) => [p.day, p.value]));
      return {
        name: w.name,
        type: "line" as const,
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: CHART_COLOR_POOL[idx % CHART_COLOR_POOL.length] },
        itemStyle: { color: CHART_COLOR_POOL[idx % CHART_COLOR_POOL.length] },
        data: xDays.map((day) => byDay.get(day) ?? null),
        connectNulls: false,
      };
    })
    .filter((s) => s.data.some((v) => v != null));

  const legendRows = Math.max(1, Math.ceil(series.length / 3));
  const legendAreaHeight = Math.min(88, 24 + legendRows * 18);
  const gridTop = legendAreaHeight + 12;
  const gridBottom = 48;

  return {
    backgroundColor: "transparent",
    color: CHART_COLOR_POOL,
    tooltip: {
      trigger: "axis" as const,
      valueFormatter: (value: number | null) => formatYen(value),
    },
    legend: {
      type: "scroll" as const,
      orient: "horizontal" as const,
      top: 4,
      left: "center" as const,
      width: "96%",
      height: legendAreaHeight,
      itemGap: 12,
      itemWidth: 14,
      itemHeight: 10,
      textStyle: { color: T.text, fontSize: 10 },
      pageTextStyle: { color: T.muted, fontSize: 10 },
      pageIconSize: 10,
    },
    grid: { left: 48, right: 16, top: gridTop, bottom: gridBottom },
    xAxis: {
      type: "category" as const,
      data: xDays,
      axisLabel: { color: T.muted, fontSize: 10 },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: T.muted,
        fontSize: 10,
        formatter: (value: number) => `¥${Math.round(value).toLocaleString("ja-JP")}`,
      },
    },
    series,
    dataZoom: [
      { type: "inside" as const, start: 0, end: 100 },
      { type: "slider" as const, height: 18, bottom: 8, start: 0, end: 100 },
    ],
  };
}
