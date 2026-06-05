import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  buildAggregationChartOption,
  formatDateTime,
  formatYen,
  pickMetric,
} from "../lib/aggregationChart";
import { T } from "../lib/constants";
import { seedSampleAggregationData } from "../lib/db";
import {
  buildSampleAggregationData,
  sampleAggregationStartYmd,
  SAMPLE_AGGREGATION_SUMMARY,
} from "../lib/sampleAggregationData";
import type { AggregationReport, WatchlistItem } from "../types";

function formatStartLabel(itemIndex: number) {
  const { y, m, d } = sampleAggregationStartYmd(itemIndex);
  return `${y}/${m}/${d}`;
}

export function ChartMocksPanel() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [reports, setReports] = useState<AggregationReport[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chartTarget, setChartTarget] = useState<"new" | "used">("used");
  const [chartMetric, setChartMetric] = useState<"min" | "median" | "avg">("median");
  const [maxPoints, setMaxPoints] = useState(24);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [bootstrapped, setBootstrapped] = useState(false);

  const applySampleToState = () => {
    const { watchlist: w, reports: r } = buildSampleAggregationData();
    setWatchlist(w);
    setReports(r);
    setSelectedIds(w.map((item) => item.id));
    setMaxPoints(24);
  };

  const loadSample = async (persistToDb: boolean) => {
    if (running) return;
    setRunning(true);
    setMessage("");
    try {
      const { watchlist: w, reports: r } = buildSampleAggregationData();
      applySampleToState();
      if (persistToDb) {
        await seedSampleAggregationData(w, r);
      }
      setMessage(
        `サンプル表示: ${SAMPLE_AGGREGATION_SUMMARY.itemCount}品目 / ${r.length}件（${SAMPLE_AGGREGATION_SUMMARY.periodStart}〜${SAMPLE_AGGREGATION_SUMMARY.periodEnd}、開始日は品目ごとに1週間ずつずれ）`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "サンプルの読み込みに失敗しました");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (bootstrapped) return;
    setBootstrapped(true);
    const params = new URLSearchParams(window.location.search);
    const auto = params.get("sample") === "1";
    loadSample(auto).catch(console.error);
  }, [bootstrapped]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const chartOption = useMemo(
    () =>
      buildAggregationChartOption({
        watchlist,
        reports,
        selectedWatchIds: selectedIds,
        chartTarget,
        chartMetric,
        maxPoints,
      }),
    [watchlist, reports, selectedIds, chartTarget, chartMetric, maxPoints],
  );

  const summaryRows = useMemo(() => {
    return watchlist.map((w, index) => {
      const itemReports = reports.filter((r) => r.watchlistId === w.id);
      const last = itemReports[itemReports.length - 1];
      return {
        id: w.id,
        name: w.name,
        category: w.category,
        start: formatStartLabel(index),
        points: itemReports.length,
        lastRun: last ? formatDateTime(last.runAt) : "—",
        lastUsedMedian: last ? pickMetric(last.prices, "used", "median") : null,
      };
    });
  }, [watchlist, reports]);

  const detailRows = useMemo(() => {
    return reports
      .filter((r) => selectedSet.has(r.watchlistId))
      .sort((a, b) => a.runAt - b.runAt || a.watchlistName.localeCompare(b.watchlistName, "ja"))
      .map((r) => ({
        id: r.id,
        date: formatDateTime(r.runAt),
        name: r.watchlistName,
        category: r.category,
        usedMedian: pickMetric(r.prices, "used", "median"),
        newMedian: pickMetric(r.prices, "new", "median"),
      }));
  }, [reports, selectedSet]);

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>集計サンプル（モック）</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>
              2025/11/1〜2026/5/31の週次データ。品目ごとに集計開始日が1週間ずつずれます（10品目・
              {SAMPLE_AGGREGATION_SUMMARY.totalReports}点）。
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => loadSample(false)}
              disabled={running}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "8px 14px",
                background: T.accent,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: running ? "wait" : "pointer",
              }}
            >
              サンプル
            </button>
            <button
              type="button"
              onClick={() => loadSample(true)}
              disabled={running}
              style={{
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                background: T.bg,
                fontSize: 11,
                cursor: running ? "wait" : "pointer",
              }}
            >
              DBにも保存
            </button>
          </div>
        </div>
        {message ? <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>{message}</div> : null}
      </div>

      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>品目一覧（集計開始日）</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>品目</th>
                <th style={{ padding: "6px 8px" }}>カテゴリ</th>
                <th style={{ padding: "6px 8px" }}>集計開始</th>
                <th style={{ padding: "6px 8px" }}>週次点数</th>
                <th style={{ padding: "6px 8px" }}>最終週（中古中央値）</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{row.name}</td>
                  <td style={{ padding: "6px 8px", color: T.muted }}>{row.category}</td>
                  <td style={{ padding: "6px 8px" }}>{row.start}</td>
                  <td style={{ padding: "6px 8px" }}>{row.points}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {row.lastRun} / {formatYen(row.lastUsedMedian)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>比較対象</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <select
            value={chartTarget}
            onChange={(e) => setChartTarget(e.target.value as "new" | "used")}
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 11 }}
          >
            <option value="new">新品</option>
            <option value="used">中古</option>
          </select>
          <select
            value={chartMetric}
            onChange={(e) => setChartMetric(e.target.value as "min" | "median" | "avg")}
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 11 }}
          >
            <option value="min">最安</option>
            <option value="median">中央値</option>
            <option value="avg">平均</option>
          </select>
          <select
            value={maxPoints}
            onChange={(e) => setMaxPoints(Number(e.target.value))}
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 11 }}
          >
            <option value={12}>12点</option>
            <option value={24}>24点</option>
            <option value={52}>52点</option>
          </select>
        </div>
        <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          {watchlist.map((w) => {
            const checked = selectedIds.includes(w.id);
            return (
              <label key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.currentTarget.checked
                      ? [...selectedIds, w.id]
                      : selectedIds.filter((id) => id !== w.id);
                    setSelectedIds(next);
                  }}
                />
                <span>{w.name}</span>
                <span style={{ color: T.muted }}>({w.category})</span>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>週次データ（選択品目）</div>
        <div style={{ maxHeight: 220, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: "left", position: "sticky", top: 0, background: T.surface }}>
                <th style={{ padding: "6px 8px" }}>実行日</th>
                <th style={{ padding: "6px 8px" }}>品目</th>
                <th style={{ padding: "6px 8px" }}>中古中央値</th>
                <th style={{ padding: "6px 8px" }}>新品中央値</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((row) => (
                <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{row.date}</td>
                  <td style={{ padding: "6px 8px" }}>{row.name}</td>
                  <td style={{ padding: "6px 8px" }}>{formatYen(row.usedMedian)}</td>
                  <td style={{ padding: "6px 8px" }}>{formatYen(row.newMedian)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!detailRows.length ? (
            <div style={{ fontSize: 11, color: T.muted, padding: 8 }}>「サンプル」を押すか、比較対象を選択してください。</div>
          ) : null}
        </div>
      </div>

      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>比較グラフ（ECharts）</div>
        <ReactECharts option={chartOption} style={{ height: 380, width: "100%" }} />
      </div>
    </div>
  );
}
