import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactECharts from "echarts-for-react";
import { buildAggregationChartOption, formatYen } from "../lib/aggregationChart";
import { fetchPrices } from "../lib/api";
import { T } from "../lib/constants";
import {
  collectCategories,
  filterReports,
  filterWatchlist,
  type ListFilterState,
  type ReportSort,
  type WatchlistSort,
} from "../lib/insightsListUtils";
import {
  enqueueWorkspaceWatchlistAdd,
  enqueueWorkspaceWatchlistDelete,
  fetchWorkspaceReports,
  fetchWorkspaceWatchlist,
  saveWorkspaceReport,
} from "../lib/workspaceApi";
import {
  clearWorkspaceToken,
  fetchWorkspaceAuthStatus,
  getWorkspaceToken,
  loginWorkspace,
} from "../lib/workspaceAuth";
import type { AggregationReport, WatchlistItem } from "../types";

interface InsightsPanelProps {
  initialName?: string;
  initialQuery?: string;
  initialCategory?: string;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isDueWeekly(item: WatchlistItem) {
  if (!item.lastAggregatedAt) return true;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - item.lastAggregatedAt >= weekMs;
}

const compactSelectStyle = {
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "5px 6px",
  fontSize: 10,
  background: T.surface,
} as const;

const compactInputStyle = {
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 10,
  background: T.surface,
} as const;

const scrollListStyle = {
  maxHeight: 260,
  overflowY: "auto" as const,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  background: T.bg,
};

function ListFilterBar(props: {
  search: string;
  category: string;
  sortValue: string;
  sortOptions: Array<{ value: string; label: string }>;
  categories: string[];
  countLabel: string;
  extra?: ReactNode;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSortChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input
          placeholder="名前・検索語で絞り込み"
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          style={compactInputStyle}
        />
        <select value={props.category} onChange={(e) => props.onCategoryChange(e.target.value)} style={compactSelectStyle}>
          <option value="all">カテゴリ: すべて</option>
          {props.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select value={props.sortValue} onChange={(e) => props.onSortChange(e.target.value)} style={compactSelectStyle}>
          {props.sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {props.extra}
        <span style={{ marginLeft: "auto", fontSize: 10, color: T.muted }}>{props.countLabel}</span>
      </div>
    </div>
  );
}

export function InsightsPanel({ initialName, initialQuery, initialCategory }: InsightsPanelProps) {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [reports, setReports] = useState<AggregationReport[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [autoChecked, setAutoChecked] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [name, setName] = useState(initialName || "");
  const [query, setQuery] = useState(initialQuery || "");
  const [category, setCategory] = useState(initialCategory || "未分類");
  const [selectedWatchIds, setSelectedWatchIds] = useState<string[]>([]);
  const [chartTarget, setChartTarget] = useState<"new" | "used">("used");
  const [chartMetric, setChartMetric] = useState<"min" | "median" | "avg">("median");
  const [maxPoints, setMaxPoints] = useState(12);
  const [watchFilter, setWatchFilter] = useState<ListFilterState>({ search: "", category: "all" });
  const [watchSort, setWatchSort] = useState<WatchlistSort>("due");
  const [watchDueOnly, setWatchDueOnly] = useState(false);
  const [reportFilter, setReportFilter] = useState<ListFilterState>({ search: "", category: "all" });
  const [reportSort, setReportSort] = useState<ReportSort>("runAtDesc");

  const categories = useMemo(() => collectCategories(watchlist, reports), [watchlist, reports]);
  const registerCategories = useMemo(() => {
    const set = new Set(categories);
    if (category.trim()) set.add(category.trim());
    return Array.from(set);
  }, [categories, category]);

  const filteredWatchlist = useMemo(
    () => filterWatchlist(watchlist, watchFilter, watchSort, watchDueOnly, isDueWeekly),
    [watchlist, watchFilter, watchSort, watchDueOnly],
  );

  const filteredReports = useMemo(
    () => filterReports(reports, reportFilter, reportSort),
    [reports, reportFilter, reportSort],
  );

  const refresh = async () => {
    try {
      const [w, r] = await Promise.all([fetchWorkspaceWatchlist(), fetchWorkspaceReports(400)]);
      setWatchlist(w);
      setReports(r);
      setMessage("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "DB読込エラー";
      if (msg.includes("認証")) {
        setAuthError(msg);
        clearWorkspaceToken();
        setAuthReady(false);
      }
      setMessage(msg);
    }
  };

  useEffect(() => {
    fetchWorkspaceAuthStatus()
      .then((required) => {
        setAuthRequired(required);
        setAuthReady(!required || Boolean(getWorkspaceToken()));
      })
      .catch(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (initialName !== undefined) setName(initialName);
    if (initialQuery !== undefined) setQuery(initialQuery);
    if (initialCategory !== undefined) setCategory(initialCategory || "未分類");
  }, [initialName, initialQuery, initialCategory]);

  useEffect(() => {
    if (!authReady) return;
    refresh().catch(console.error);
  }, [authReady]);

  useEffect(() => {
    if (!watchlist.length) return;
    if (selectedWatchIds.length) return;
    setSelectedWatchIds(watchlist.slice(0, 3).map((w) => w.id));
  }, [watchlist, selectedWatchIds.length]);

  useEffect(() => {
    if (autoChecked || running || !watchlist.length) return;
    setAutoChecked(true);
    if (watchlist.some((w) => isDueWeekly(w))) {
      runAggregation(true).catch(console.error);
    }
  }, [watchlist, autoChecked, running]);

  const runAggregation = async (onlyDue: boolean) => {
    if (running) return;
    setRunning(true);
    setMessage("");
    try {
      const targets = watchlist.filter((w) => (onlyDue ? isDueWeekly(w) : true));
      if (!targets.length) {
        setMessage(onlyDue ? "週次対象はありません（全て最新です）" : "集計対象がありません");
        return;
      }

      for (const item of targets) {
        const prices = await fetchPrices(item.query);
        const runAt = Date.now();
        const report: AggregationReport = {
          id: crypto.randomUUID(),
          watchlistId: item.id,
          watchlistName: item.name,
          category: item.category,
          frequency: "weekly",
          runAt,
          prices,
        };
        await saveWorkspaceReport(report);
      }
      await refresh();
      setMessage(`${targets.length}件を集計しました`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "集計に失敗しました");
    } finally {
      setRunning(false);
    }
  };

  const addWatch = async () => {
    if (!name.trim() || !query.trim()) {
      setMessage("リスト名と検索語を入力してください");
      return;
    }
    try {
      const item: WatchlistItem = {
        id: crypto.randomUUID(),
        name: name.trim(),
        query: query.trim(),
        category: category.trim() || "未分類",
        frequency: "weekly",
        createdAt: Date.now(),
      };
      const result = await enqueueWorkspaceWatchlistAdd(item);
      setWatchlist(result.watchlist);
      setName("");
      setQuery("");
      setMessage(`登録しました: ${item.name}`);
    } catch (e) {
      setMessage(e instanceof Error ? `登録失敗: ${e.message}` : "登録失敗");
    }
  };

  const deleteWatch = async (id: string) => {
    try {
      const result = await enqueueWorkspaceWatchlistDelete(id);
      setWatchlist(result.watchlist);
      setMessage("リストから削除しました");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const submitLogin = async () => {
    setAuthError("");
    try {
      await loginWorkspace(password);
      setAuthReady(true);
      setPassword("");
      await refresh();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "ログインに失敗しました");
    }
  };

  const chartOption = useMemo(
    () =>
      buildAggregationChartOption({
        watchlist,
        reports,
        selectedWatchIds,
        chartTarget,
        chartMetric,
        maxPoints,
      }),
    [selectedWatchIds, watchlist, reports, chartTarget, chartMetric, maxPoints],
  );

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
      {authRequired && !authReady ? (
        <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ワークスペース認証</div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
            組織共有の集計リストにアクセスするにはパスワードを入力してください。
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ワークスペースパスワード"
            style={{ width: "100%", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 8 }}
          />
          {authError ? <div style={{ fontSize: 11, color: T.danger, marginBottom: 8 }}>{authError}</div> : null}
          <button
            type="button"
            onClick={submitLogin}
            style={{ border: "none", borderRadius: 8, padding: "8px 12px", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 700 }}
          >
            ログイン
          </button>
        </div>
      ) : null}

      {authReady ? (
        <>
      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>集計リスト登録</div>
        <div style={{ fontSize: 10, color: T.muted, marginBottom: 8 }}>
          追加・削除はサーバー側キューで順番に処理されます（全員で同じリストを共有）。
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 10, color: T.muted }}>表示名（任意の管理名）</div>
          <input
            placeholder="リスト名（例: Anker USB-Cハブ）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12 }}
          />
          <div style={{ fontSize: 10, color: T.muted }}>検索語（価格APIに渡すキーワード）</div>
          <input
            placeholder="検索語"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12 }}
            >
              {registerCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input value="weekly" disabled style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12 }} />
          </div>
          <button
            type="button"
            onClick={addWatch}
            style={{ border: "none", borderRadius: 8, padding: "8px 10px", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 700 }}
          >
            リストに追加
          </button>
        </div>
      </div>

      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>週次集計</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => runAggregation(true)}
              disabled={running}
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", background: T.bg, fontSize: 11 }}
            >
              期限分のみ
            </button>
            <button
              type="button"
              onClick={() => runAggregation(false)}
              disabled={running}
              style={{ border: "none", borderRadius: 8, padding: "6px 8px", background: T.accent, color: "#fff", fontSize: 11 }}
            >
              全件実行
            </button>
          </div>
        </div>
        {message ? <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>{message}</div> : null}
        <ListFilterBar
          search={watchFilter.search}
          category={watchFilter.category}
          sortValue={watchSort}
          sortOptions={[
            { value: "due", label: "期限順" },
            { value: "name", label: "名前順" },
            { value: "category", label: "カテゴリ順" },
            { value: "lastRun", label: "最終集計順" },
            { value: "created", label: "登録順" },
          ]}
          categories={categories}
          countLabel={`${filteredWatchlist.length} / ${watchlist.length}件`}
          onSearchChange={(search) => setWatchFilter((prev) => ({ ...prev, search }))}
          onCategoryChange={(categoryValue) => setWatchFilter((prev) => ({ ...prev, category: categoryValue }))}
          onSortChange={(value) => setWatchSort(value as WatchlistSort)}
          extra={
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}>
              <input type="checkbox" checked={watchDueOnly} onChange={(e) => setWatchDueOnly(e.currentTarget.checked)} />
              期限分のみ
            </label>
          }
        />
        <div style={scrollListStyle}>
          {filteredWatchlist.map((w, idx) => (
            <div
              key={w.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 6,
                padding: "6px 8px",
                borderBottom: idx === filteredWatchlist.length - 1 ? "none" : `1px solid ${T.border}`,
                fontSize: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{w.name}</span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: T.accentBg,
                      color: T.accent,
                      fontWeight: 600,
                    }}
                  >
                    {w.category}
                  </span>
                  {isDueWeekly(w) ? (
                    <span style={{ fontSize: 9, color: T.warn, fontWeight: 600 }}>要集計</span>
                  ) : null}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    color: T.muted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={w.query}
                >
                  {w.query}
                </div>
                <div style={{ marginTop: 2, color: T.muted }}>
                  最終: {w.lastAggregatedAt ? formatDate(w.lastAggregatedAt) : "未実行"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteWatch(w.id)}
                style={{ border: "none", background: "none", color: T.danger, fontSize: 10, cursor: "pointer", alignSelf: "start" }}
              >
                削除
              </button>
            </div>
          ))}
          {!filteredWatchlist.length ? (
            <div style={{ fontSize: 10, color: T.muted, padding: "10px 8px" }}>
              {watchlist.length ? "条件に一致するリストがありません。" : "登録リストはまだありません。"}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>分析結果</div>
        <ListFilterBar
          search={reportFilter.search}
          category={reportFilter.category}
          sortValue={reportSort}
          sortOptions={[
            { value: "runAtDesc", label: "実行日（新しい順）" },
            { value: "runAtAsc", label: "実行日（古い順）" },
            { value: "name", label: "名前順" },
            { value: "category", label: "カテゴリ順" },
          ]}
          categories={categories}
          countLabel={`${filteredReports.length} / ${reports.length}件`}
          onSearchChange={(search) => setReportFilter((prev) => ({ ...prev, search }))}
          onCategoryChange={(categoryValue) => setReportFilter((prev) => ({ ...prev, category: categoryValue }))}
          onSortChange={(value) => setReportSort(value as ReportSort)}
        />
        <div style={scrollListStyle}>
          {filteredReports.map((r, idx) => (
            <div
              key={r.id}
              style={{
                padding: "6px 8px",
                borderBottom: idx === filteredReports.length - 1 ? "none" : `1px solid ${T.border}`,
                fontSize: 10,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{r.watchlistName}</span>
                <span style={{ fontSize: 9, color: T.muted }}>{r.category}</span>
                <span style={{ fontSize: 9, color: T.muted }}>{formatDate(r.runAt)}</span>
              </div>
              <div style={{ marginTop: 3, color: T.text, lineHeight: 1.4 }}>
                新品 {formatYen(r.prices.rakuten?.median ?? r.prices.yahooShopping?.median)} / 中古{" "}
                {formatYen(r.prices.rakutenUsed?.median ?? r.prices.yahooShoppingUsed?.median)}
              </div>
              <div style={{ marginTop: 1, color: T.muted, lineHeight: 1.4 }}>
                最安 {formatYen(r.prices.rakuten?.min ?? r.prices.yahooShopping?.min)} /{" "}
                {formatYen(r.prices.rakutenUsed?.min ?? r.prices.yahooShoppingUsed?.min)}
              </div>
            </div>
          ))}
          {!filteredReports.length ? (
            <div style={{ fontSize: 10, color: T.muted, padding: "10px 8px" }}>
              {reports.length ? "条件に一致する分析結果がありません。" : "分析結果はまだありません。"}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>比較グラフ（ECharts）</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <select value={chartTarget} onChange={(e) => setChartTarget(e.target.value as "new" | "used")} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 11 }}>
            <option value="new">新品</option>
            <option value="used">中古</option>
          </select>
          <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value as "min" | "median" | "avg")} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 11 }}>
            <option value="min">最安</option>
            <option value="median">中央値</option>
            <option value="avg">平均</option>
          </select>
          <select value={maxPoints} onChange={(e) => setMaxPoints(Number(e.target.value))} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 11 }}>
            <option value={8}>8点</option>
            <option value={12}>12点</option>
            <option value={24}>24点</option>
            <option value={52}>52点</option>
          </select>
        </div>
        <div style={{ ...scrollListStyle, maxHeight: 140, marginBottom: 10 }}>
          {watchlist.map((w) => {
            const checked = selectedWatchIds.includes(w.id);
            return (
              <label
                key={w.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                  padding: "5px 8px",
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.currentTarget.checked
                      ? [...selectedWatchIds, w.id]
                      : selectedWatchIds.filter((id) => id !== w.id);
                    setSelectedWatchIds(next);
                  }}
                />
                <span style={{ fontWeight: 600 }}>{w.name}</span>
                <span style={{ color: T.muted }}>({w.category})</span>
              </label>
            );
          })}
        </div>
        <ReactECharts option={chartOption} style={{ height: 360, width: "100%" }} />
      </div>
        </>
      ) : null}
    </div>
  );
}
