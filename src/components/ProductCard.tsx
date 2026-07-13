import { useEffect, useMemo, useState } from "react";
import type { PricesResponse, Product, SimilarResponse } from "../types";
import { LIQUIDITY_MARKETS, MARKETS, T } from "../lib/constants";
import {
  defaultIncludedForItem,
  findCheapestIncludedItem,
  itemTypeLabel,
  type PriceListItem,
  reasonLabels,
  summarizeIncludedItems,
} from "../lib/priceStats";

interface ProductCardProps {
  product: Product;
  prices?: PricesResponse | null;
  pricesLoading?: boolean;
  similar?: SimilarResponse | null;
  similarLoading?: boolean;
  excluded?: boolean;
  onEdit?: (query: string) => void;
  onRefreshPrices?: () => void;
  onFetchSimilar?: () => void;
  onApplySimilarSearch?: (searchQuery: string) => void;
  onToggleExclude?: (next: boolean) => void;
}

function formatYen(n?: number | null) {
  if (n == null) return "—";
  return `¥${n.toLocaleString("ja-JP")}`;
}

function confidenceColor(c?: Product["confidence"]) {
  if (c === "high") return T.success;
  if (c === "medium") return T.warn;
  return T.danger;
}

function getItemKey(section: string, idx: number, price: number, url?: string) {
  return `${section}:${idx}:${url || ""}:${price}`;
}

export function ProductCard({
  product,
  prices,
  pricesLoading,
  similar,
  similarLoading,
  excluded,
  onEdit,
  onRefreshPrices,
  onFetchSimilar,
  onApplySimilarSearch,
  onToggleExclude,
}: ProductCardProps) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(product.searchQuery);
  const [cost, setCost] = useState("");
  const [selectedByKey, setSelectedByKey] = useState<Record<string, boolean>>({});
  const [lastIndexBySection, setLastIndexBySection] = useState<Record<string, number>>({});
  const [mainOnlyAggregate, setMainOnlyAggregate] = useState(true);
  const [includedOverrides, setIncludedOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelectedByKey({});
    setLastIndexBySection({});
    setIncludedOverrides({});
  }, [prices]);
  useEffect(() => {
    setQuery(product.searchQuery);
  }, [product.searchQuery]);

  const isSelected = useMemo(
    () => (key: string) => Boolean(selectedByKey[key]),
    [selectedByKey],
  );

  const sections = useMemo(
    () => [
      { key: "rakuten-new", label: "楽天 新品", summary: prices?.rakuten },
      { key: "yahoo-new", label: "Yahoo! 新品", summary: prices?.yahooShopping },
      { key: "rakuten-used", label: "楽天 中古", summary: prices?.rakutenUsed },
      { key: "yahoo-used", label: "Yahoo! 中古", summary: prices?.yahooShoppingUsed },
    ],
    [prices],
  );

  const sectionItemsWithOverrides = useMemo(() => {
    const map: Record<string, PriceListItem[]> = {};
    for (const section of sections) {
      map[section.key] = (section.summary?.items || []).map((item, idx) => ({
        ...item,
        includedOverride: includedOverrides[getItemKey(section.key, idx, item.price, item.url)],
      }));
    }
    return map;
  }, [sections, includedOverrides]);

  const sectionDisplayStats = useMemo(() => {
    const stats: Record<string, ReturnType<typeof summarizeIncludedItems>> = {};
    for (const section of sections) {
      stats[section.key] = summarizeIncludedItems(sectionItemsWithOverrides[section.key] || [], mainOnlyAggregate);
    }
    return stats;
  }, [sections, sectionItemsWithOverrides, mainOnlyAggregate]);

  const sectionMinItems = useMemo(() => {
    const mins: Record<string, ReturnType<typeof findCheapestIncludedItem>> = {};
    for (const section of sections) {
      mins[section.key] = findCheapestIncludedItem(sectionItemsWithOverrides[section.key] || [], mainOnlyAggregate);
    }
    return mins;
  }, [sections, sectionItemsWithOverrides, mainOnlyAggregate]);

  const selectedRows = useMemo(
    () =>
      sections.flatMap((section) =>
        (section.summary?.items || [])
          .map((item, idx) => ({
            sectionKey: section.key,
            sectionLabel: section.label,
            idx,
            key: getItemKey(section.key, idx, item.price, item.url),
            item,
          }))
          .filter((row) => isSelected(row.key)),
      ),
    [sections, isSelected],
  );

  const costNum = Number(cost.replace(/[^\d]/g, ""));
  const refPrice =
    sectionDisplayStats["rakuten-used"]?.min ??
    sectionDisplayStats["yahoo-used"]?.min ??
    sectionDisplayStats["rakuten-new"]?.min ??
    sectionDisplayStats["yahoo-new"]?.min ??
    null;
  const profit = costNum > 0 && refPrice != null ? refPrice - costNum : null;
  const hasPriceData = Boolean(prices?.rakuten || prices?.yahooShopping || prices?.rakutenUsed || prices?.yahooShoppingUsed);
  const warningList = prices?.warnings || [];
  const hasNewWarning = warningList.some((w) => /(?:rakuten|yahoo_shopping)\(new\):/i.test(w));
  const visibleWarnings = warningList.filter((w) => !/(?:rakuten|yahoo_shopping)\(new\):/i.test(w));

  const toggleSelection = (sectionKey: string, index: number, checked: boolean, withRange: boolean) => {
    setSelectedByKey((prev) => {
      const next = { ...prev };
      const section = sections.find((s) => s.key === sectionKey);
      const items = section?.summary?.items || [];
      const current = items[index];
      if (!current) return prev;

      if (withRange && lastIndexBySection[sectionKey] != null) {
        const start = Math.min(lastIndexBySection[sectionKey], index);
        const end = Math.max(lastIndexBySection[sectionKey], index);
        for (let i = start; i <= end; i++) {
          const row = items[i];
          if (!row) continue;
          const key = getItemKey(sectionKey, i, row.price, row.url);
          next[key] = checked;
        }
      } else {
        const key = getItemKey(sectionKey, index, current.price, current.url);
        next[key] = checked;
      }
      return next;
    });
    setLastIndexBySection((prev) => ({ ...prev, [sectionKey]: index }));
  };

  const selectAllInSection = (sectionKey: string, checked: boolean) => {
    const section = sections.find((s) => s.key === sectionKey);
    const items = section?.summary?.items || [];
    setSelectedByKey((prev) => {
      const next = { ...prev };
      items.forEach((item, idx) => {
        next[getItemKey(sectionKey, idx, item.price, item.url)] = checked;
      });
      return next;
    });
  };

  const exportCsv = () => {
    if (!selectedRows.length) return;
    const header = [
      "商品名",
      "価格",
      "サイト",
      "区分",
      "itemType",
      "included",
      "score",
      "reasons",
      "商品リンク",
      "検索語",
      "JAN",
    ];
    const csvEscape = (v: string | number | boolean | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      header.map(csvEscape).join(","),
      ...selectedRows.map((row) => {
        const itemKey = getItemKey(row.sectionKey, row.idx, row.item.price, row.item.url);
        const withOverride = {
          ...row.item,
          includedOverride: includedOverrides[itemKey],
        };
        const included = defaultIncludedForItem(withOverride, mainOnlyAggregate);
        return [
          row.item.title || "",
          row.item.price,
          row.sectionLabel.includes("楽天") ? "楽天" : "Yahoo!ショッピング",
          row.sectionLabel.includes("中古") ? "中古" : "新品",
          itemTypeLabel(row.item.itemType),
          included,
          row.item.score ?? "",
          (row.item.reasons || []).join("|"),
          row.item.url || "",
          query,
          product.jan || "",
        ]
          .map(csvEscape)
          .join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `souba-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius + 2,
        padding: 18,
        marginTop: 12,
        opacity: excluded ? 0.65 : 1,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>{product.name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {product.brand && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: T.bg, color: T.muted }}>
              {product.brand}
            </span>
          )}
          {product.model && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: T.bg, color: T.muted }}>
              {product.model}
            </span>
          )}
          {product.confidence && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 4,
                background: `${confidenceColor(product.confidence)}18`,
                color: confidenceColor(product.confidence),
                fontWeight: 600,
              }}
            >
              確信度: {product.confidence}
            </span>
          )}
        </div>
        {product.jan && (
          <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, marginTop: 6 }}>JAN: {product.jan}</div>
        )}
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
            marginTop: 6,
            display: "inline-block",
            background: T.accentBg,
            color: T.accent,
            fontWeight: 600,
          }}
        >
          Gemini特定
        </span>
        {excluded ? (
          <span
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              marginTop: 6,
              marginLeft: 6,
              display: "inline-block",
              background: T.warnBg,
              color: T.warn,
              fontWeight: 600,
            }}
          >
            除外中
          </span>
        ) : null}
      </div>

      <div
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: T.bg,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>🔍</span>
        {editing ? (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => {
              setEditing(false);
              onEdit?.(query);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(false);
                onEdit?.(query);
              }
            }}
            autoFocus
            style={{
              flex: 1,
              border: `1px solid ${T.accent}`,
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 13,
              fontFamily: T.font,
              outline: "none",
            }}
          />
        ) : (
          <div onClick={() => setEditing(true)} style={{ flex: 1, fontSize: 13, color: T.text, cursor: "text", padding: "4px 0" }}>
            {query}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (editing) onEdit?.(query);
            setEditing(!editing);
          }}
          style={{ background: "none", border: "none", fontSize: 12, color: T.accent, cursor: "pointer", fontWeight: 600 }}
        >
          {editing ? "確定" : "編集"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={onRefreshPrices}
          style={{ background: T.accentBg, border: `1px solid ${T.accent}33`, color: T.accent, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          価格再取得
        </button>
        <button
          type="button"
          onClick={onFetchSimilar}
          disabled={similarLoading}
          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: similarLoading ? "wait" : "pointer", opacity: similarLoading ? 0.7 : 1 }}
        >
          {similar?.similar_products?.length ? "類似候補再取得" : "類似候補を取得"}
        </button>
        <button
          type="button"
          onClick={() => onToggleExclude?.(!excluded)}
          style={{ background: excluded ? T.warnBg : T.surface, border: `1px solid ${T.border}`, color: excluded ? T.warn : T.muted, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          {excluded ? "除外解除" : "除外"}
        </button>
      </div>

      {(pricesLoading || prices) && (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 8,
            background: T.accentBg,
            border: `1px solid ${T.accent}22`,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: T.accent, marginBottom: 8 }}>
            API参考価格（販売中・本体集計）
          </div>
          {pricesLoading ? (
            <div style={{ fontSize: 12, color: T.muted }}>価格取得中...</div>
          ) : (
            <>
              {!hasPriceData ? (
                <div style={{ fontSize: 12, color: T.muted }}>価格データが見つかりませんでした。</div>
              ) : null}
              <div style={{ display: "grid", gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ color: T.text, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>新品参考（販売中）</div>
                  {hasNewWarning ? (
                    <div style={{ fontSize: 12, color: T.warn, fontWeight: 700 }}>API取得エラー(新品警告)</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div style={{ color: T.muted, fontSize: 10 }}>楽天 最安 / 中央 / 平均（本体集計）</div>
                        <div style={{ fontWeight: 700 }}>
                          {formatYen(sectionDisplayStats["rakuten-new"]?.min)} /{" "}
                          {formatYen(sectionDisplayStats["rakuten-new"]?.median)} /{" "}
                          {formatYen(sectionDisplayStats["rakuten-new"]?.avg)}
                        </div>
                        {sectionMinItems["rakuten-new"]?.url ? (
                          <a
                            href={sectionMinItems["rakuten-new"]!.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-block", marginTop: 2, fontSize: 10, color: T.accent }}
                            title={sectionMinItems["rakuten-new"]?.title || "楽天の最安値商品を開く"}
                          >
                            最安値商品を開く ↗
                          </a>
                        ) : null}
                      </div>
                      <div>
                        <div style={{ color: T.muted, fontSize: 10 }}>Yahoo! 最安 / 中央 / 平均（本体集計）</div>
                        <div style={{ fontWeight: 700 }}>
                          {formatYen(sectionDisplayStats["yahoo-new"]?.min)} /{" "}
                          {formatYen(sectionDisplayStats["yahoo-new"]?.median)} /{" "}
                          {formatYen(sectionDisplayStats["yahoo-new"]?.avg)}
                        </div>
                        {sectionMinItems["yahoo-new"]?.url ? (
                          <a
                            href={sectionMinItems["yahoo-new"]!.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-block", marginTop: 2, fontSize: 10, color: T.accent }}
                            title={sectionMinItems["yahoo-new"]?.title || "Yahoo!ショッピングの最安値商品を開く"}
                          >
                            最安値商品を開く ↗
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: T.text, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>中古参考（販売中・検索語+「中古」）</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ color: T.muted, fontSize: 10 }}>楽天 最安 / 中央 / 平均（本体集計）</div>
                      <div style={{ fontWeight: 700 }}>
                        {formatYen(sectionDisplayStats["rakuten-used"]?.min)} /{" "}
                        {formatYen(sectionDisplayStats["rakuten-used"]?.median)} /{" "}
                        {formatYen(sectionDisplayStats["rakuten-used"]?.avg)}
                      </div>
                      {sectionMinItems["rakuten-used"]?.url ? (
                        <a
                          href={sectionMinItems["rakuten-used"]!.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-block", marginTop: 2, fontSize: 10, color: T.accent }}
                          title={sectionMinItems["rakuten-used"]?.title || "楽天の中古最安値商品を開く"}
                        >
                          最安値商品を開く ↗
                        </a>
                      ) : null}
                    </div>
                    <div>
                      <div style={{ color: T.muted, fontSize: 10 }}>Yahoo! 最安 / 中央 / 平均（本体集計）</div>
                      <div style={{ fontWeight: 700 }}>
                        {formatYen(sectionDisplayStats["yahoo-used"]?.min)} /{" "}
                        {formatYen(sectionDisplayStats["yahoo-used"]?.median)} /{" "}
                        {formatYen(sectionDisplayStats["yahoo-used"]?.avg)}
                      </div>
                      {sectionMinItems["yahoo-used"]?.url ? (
                        <a
                          href={sectionMinItems["yahoo-used"]!.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-block", marginTop: 2, fontSize: 10, color: T.accent }}
                          title={sectionMinItems["yahoo-used"]?.title || "Yahoo!ショッピングの中古最安値商品を開く"}
                        >
                          最安値商品を開く ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              {visibleWarnings.length ? (
                <div style={{ marginTop: 8, fontSize: 10, color: T.warn, lineHeight: 1.5 }}>
                  {visibleWarnings.join(" / ")}
                </div>
              ) : null}
              {prices ? (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontSize: 11, color: T.accent, fontWeight: 700 }}>
                    検索一覧を表示（エクスポート対象を選択）
                  </summary>
                  <div style={{ marginTop: 6, fontSize: 10, color: T.muted }}>
                    操作: 左チェック=CSVエクスポート、右チェック=集計対象（手動上書き）、Shift+クリックで範囲選択
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 8,
                      fontSize: 11,
                      color: T.text,
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={mainOnlyAggregate}
                      onChange={(e) => setMainOnlyAggregate(e.currentTarget.checked)}
                    />
                    本体のみ集計（キット除外）
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={selectedRows.length === 0}
                      style={{
                        background: T.accent,
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 11,
                        padding: "6px 10px",
                        opacity: selectedRows.length ? 1 : 0.5,
                        cursor: selectedRows.length ? "pointer" : "not-allowed",
                      }}
                    >
                      CSVエクスポート（{selectedRows.length}件）
                    </button>
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                    {sections.map((section) => {
                      const items = section.summary?.items || [];
                      if (!items.length) return null;
                      const selectedCount = items.filter((item, idx) =>
                        isSelected(getItemKey(section.key, idx, item.price, item.url)),
                      ).length;
                      return (
                        <div key={section.key} style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface }}>
                          <div
                            style={{
                              padding: "8px 10px",
                              borderBottom: `1px solid ${T.border}`,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700 }}>
                              {section.label}（{selectedCount}/{items.length}件選択）
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => selectAllInSection(section.key, true)}
                                style={{ background: "none", border: "none", color: T.accent, fontSize: 10, cursor: "pointer" }}
                              >
                                全選択
                              </button>
                              <button
                                type="button"
                                onClick={() => selectAllInSection(section.key, false)}
                                style={{ background: "none", border: "none", color: T.muted, fontSize: 10, cursor: "pointer" }}
                              >
                                解除
                              </button>
                            </div>
                          </div>
                          <div style={{ maxHeight: 180, overflow: "auto" }}>
                            {items.map((item, idx) => {
                              const itemKey = getItemKey(section.key, idx, item.price, item.url);
                              const selected = isSelected(itemKey);
                              const withOverride: PriceListItem = {
                                ...item,
                                includedOverride: includedOverrides[itemKey],
                              };
                              const aggregateIncluded = defaultIncludedForItem(withOverride, mainOnlyAggregate);
                              return (
                                <div
                                  key={itemKey}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "72px 1fr auto auto",
                                    gap: 8,
                                    padding: "8px 10px",
                                    borderBottom: idx === items.length - 1 ? "none" : `1px solid ${T.border}`,
                                    opacity: aggregateIncluded ? 1 : 0.55,
                                    background: aggregateIncluded ? "transparent" : `${T.warn}08`,
                                  }}
                                >
                                  <div style={{ fontWeight: 700, fontSize: 12 }}>{formatYen(item.price)}</div>
                                  <div style={{ minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: T.text,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                      title={item.title || "商品名なし"}
                                    >
                                      {item.title || "(商品名なし)"}
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2, fontSize: 10, color: T.muted }}>
                                      <span>分類: {itemTypeLabel(item.itemType)}</span>
                                      <span>スコア: {item.score ?? "—"}</span>
                                      <span title={reasonLabels(item.reasons)}>除外理由: {reasonLabels(item.reasons)}</span>
                                    </div>
                                    <a
                                      href={item.url || "#"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ fontSize: 10, color: T.accent }}
                                    >
                                      商品リンク ↗
                                    </a>
                                  </div>
                                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={(e) => {
                                        const checked = e.currentTarget.checked;
                                        const shiftKey = Boolean((e.nativeEvent as MouseEvent).shiftKey);
                                        toggleSelection(section.key, idx, checked, shiftKey);
                                      }}
                                    />
                                    CSV
                                  </label>
                                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}>
                                    <input
                                      type="checkbox"
                                      checked={aggregateIncluded}
                                      onChange={(e) => {
                                        setIncludedOverrides((prev) => ({
                                          ...prev,
                                          [itemKey]: e.currentTarget.checked,
                                        }));
                                      }}
                                    />
                                    集計
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </>
          )}
        </div>
      )}

      <div
        style={{
          marginBottom: 14,
          padding: "10px 12px",
          borderRadius: 8,
          background: T.bg,
          border: `1px solid ${T.border}`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>類似商品（誤検出リスク確認）</div>
        {similarLoading ? <div style={{ fontSize: 12, color: T.muted }}>類似候補を取得中...</div> : null}
        {!similarLoading && similar?.similar_products?.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {similar.similar_products.map((s, idx) => (
              <div key={`${s.model || s.name}-${idx}`} style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, padding: "8px 10px" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{s.name}</div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                  {s.model || "型番不明"} / {s.relationType || "similar"}
                </div>
                {s.differencePoints?.length ? (
                  <div style={{ fontSize: 10, color: T.text, marginTop: 4 }}>差分: {s.differencePoints.join(" / ")}</div>
                ) : null}
                {s.riskNote ? <div style={{ fontSize: 10, color: T.warn, marginTop: 2 }}>注意: {s.riskNote}</div> : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {s.searchQuery ? (
                    <button
                      type="button"
                      onClick={() => onApplySimilarSearch?.(s.searchQuery!)}
                      style={{
                        border: `1px solid ${T.accent}44`,
                        background: T.accentBg,
                        color: T.accent,
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      この候補で検索
                    </button>
                  ) : null}
                  {s.links?.rakuten ? (
                    <a href={s.links.rakuten} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.accent }}>
                      楽天画像確認 ↗
                    </a>
                  ) : null}
                  {s.links?.yahooShopping ? (
                    <a href={s.links.yahooShopping} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.accent }}>
                      Yahoo画像確認 ↗
                    </a>
                  ) : null}
                  {s.links?.googleImages ? (
                    <a href={s.links.googleImages} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.accent }}>
                      Google画像 ↗
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!similarLoading && !similar?.similar_products?.length ? (
          <div style={{ fontSize: 12, color: T.muted }}>「類似候補を取得」で候補一覧を表示します。</div>
        ) : null}
      </div>

      <div
        style={{
          marginBottom: 14,
          padding: "10px 12px",
          borderRadius: 8,
          background: T.bg,
          border: `1px solid ${T.border}`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 8 }}>利益計算（参考）</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>仕入れ値</span>
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="例: 3000"
            inputMode="numeric"
            style={{
              flex: 1,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 13,
              fontFamily: T.mono,
              outline: "none",
            }}
          />
        </div>
        {profit != null && (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            想定粗利（最安参考）:{" "}
            <span style={{ fontWeight: 700, color: profit >= 0 ? T.success : T.danger }}>{formatYen(profit)}</span>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>流動量・落札相場の参考 →</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {LIQUIDITY_MARKETS.map((m) => (
          <a
            key={m.id}
            href={m.url(query)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 10,
              background: `${m.color}08`,
              border: `1px solid ${m.color}18`,
              color: T.text,
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <span style={{ fontSize: 15 }}>{m.icon}</span>
            <span style={{ flex: 1 }}>{m.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round">
              <path d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </a>
        ))}
      </div>

      <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>中古相場は各サイトで確認 →</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {MARKETS.map((m) => (
          <a
            key={m.id}
            href={m.url(query)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: `${m.color}08`,
              border: `1px solid ${m.color}18`,
              color: T.text,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
              transition: "background .15s",
            }}
          >
            <span style={{ fontSize: 17 }}>{m.icon}</span>
            <span style={{ flex: 1 }}>{m.name}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round">
              <path d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
