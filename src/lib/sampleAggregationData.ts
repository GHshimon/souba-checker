import type { AggregationReport, PriceSummary, PricesResponse, WatchlistItem } from "../types";

/** 集計サンプルの期間（JST） */
export const SAMPLE_PERIOD_START = "2025-11-01";
export const SAMPLE_PERIOD_END = "2026-05-31";
const SAMPLE_ID_PREFIX = "sample-watch-";

type SampleProductDef = {
  suffix: string;
  name: string;
  query: string;
  category: string;
  /** 中古中央値の基準価格（円） */
  usedMedianBase: number;
};

const SAMPLE_PRODUCTS: SampleProductDef[] = [
  { suffix: "01", name: "Anker USB-C ハブ 7-in-1", query: "Anker USB-C ハブ 7-in-1", category: "PC周辺機器", usedMedianBase: 5500 },
  { suffix: "02", name: "BUFFALO 2.5GbE アダプタ", query: "BUFFALO 2.5GbE アダプタ", category: "PC周辺機器", usedMedianBase: 4300 },
  { suffix: "03", name: "Logicool MX Master 3S", query: "Logicool MX Master 3S", category: "ガジェット", usedMedianBase: 12500 },
  { suffix: "04", name: "Nintendo Switch 有機EL", query: "Nintendo Switch 有機EL", category: "ゲーム", usedMedianBase: 32000 },
  { suffix: "05", name: "Sony WH-1000XM5", query: "Sony WH-1000XM5", category: "ガジェット", usedMedianBase: 38000 },
  { suffix: "06", name: "Dyson V15 Detect", query: "Dyson V15 Detect", category: "家電", usedMedianBase: 85000 },
  { suffix: "07", name: "Kindle Paperwhite", query: "Kindle Paperwhite", category: "本", usedMedianBase: 18000 },
  { suffix: "08", name: "象印 圧力IH炊飯器", query: "象印 圧力IH炊飯器", category: "家電", usedMedianBase: 45000 },
  { suffix: "09", name: "PlayStation 5", query: "PlayStation 5", category: "ゲーム", usedMedianBase: 55000 },
  { suffix: "10", name: "iPad Air M2", query: "iPad Air M2", category: "ガジェット", usedMedianBase: 75000 },
];

function jstNoon(year: number, month: number, day: number): number {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`).getTime();
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function addDays(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const dt = new Date(jstNoon(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

function compareYmd(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): number {
  const ta = jstNoon(a.y, a.m, a.d);
  const tb = jstNoon(b.y, b.m, b.d);
  return ta - tb;
}

/** 品目 index ごとに集計開始日を1週間ずつずらす */
export function sampleAggregationStartYmd(itemIndex: number): { y: number; m: number; d: number } {
  const base = parseYmd(SAMPLE_PERIOD_START);
  return addDays(base.y, base.m, base.d, itemIndex * 7);
}

function weeklyRunDates(itemIndex: number): number[] {
  const start = sampleAggregationStartYmd(itemIndex);
  const end = parseYmd(SAMPLE_PERIOD_END);
  const dates: number[] = [];
  let cur = start;
  while (compareYmd(cur, end) <= 0) {
    dates.push(jstNoon(cur.y, cur.m, cur.d));
    cur = addDays(cur.y, cur.m, cur.d, 7);
  }
  return dates;
}

/** 週次・品目ごとにゆらぎのある価格を生成（決定的） */
function mockPriceSummary(base: number, itemIndex: number, weekIndex: number, kind: "new" | "used"): PriceSummary {
  const phase = itemIndex * 0.7 + weekIndex * 0.35;
  const trend = Math.sin(phase) * 0.04 + Math.cos(phase * 0.5) * 0.02;
  const seasonal = Math.sin((weekIndex + itemIndex) * 0.45) * 0.03;
  const multiplier = kind === "new" ? 1.18 : 1;
  const drift = -weekIndex * 0.0025;
  const median = Math.round(base * multiplier * (1 + trend + seasonal + drift));
  const spread = Math.max(80, Math.round(median * 0.06));
  const min = Math.max(100, median - spread - (weekIndex % 3) * 40);
  const max = median + spread + (weekIndex % 4) * 30;
  const avg = Math.round((min + median + max) / 3);
  return {
    min,
    max,
    avg,
    median,
    count: 18 + (weekIndex % 7) * 3,
    currency: "JPY",
    makerFilterApplied: false,
  };
}

function mockPricesResponse(base: number, itemIndex: number, weekIndex: number): PricesResponse {
  const rakuten = mockPriceSummary(base, itemIndex, weekIndex, "new");
  const rakutenUsed = mockPriceSummary(base, itemIndex, weekIndex, "used");
  return {
    rakuten,
    yahooShopping: {
      ...rakuten,
      min: rakuten.min! + 120,
      median: rakuten.median! + 90,
      avg: rakuten.avg! + 100,
    },
    rakutenUsed,
    yahooShoppingUsed: {
      ...rakutenUsed,
      min: Math.max(100, rakutenUsed.min! - 80),
      median: rakutenUsed.median! - 50,
      avg: rakutenUsed.avg! - 60,
    },
  };
}

export function buildSampleAggregationData(): { watchlist: WatchlistItem[]; reports: AggregationReport[] } {
  const watchlist: WatchlistItem[] = [];
  const reports: AggregationReport[] = [];

  SAMPLE_PRODUCTS.forEach((product, itemIndex) => {
    const id = `${SAMPLE_ID_PREFIX}${product.suffix}`;
    const runDates = weeklyRunDates(itemIndex);
    const createdAt = runDates[0] ?? jstNoon(2025, 11, 1);
    const lastAggregatedAt = runDates[runDates.length - 1];

    watchlist.push({
      id,
      name: product.name,
      query: product.query,
      category: product.category,
      frequency: "weekly",
      createdAt,
      lastAggregatedAt,
    });

    runDates.forEach((runAt, weekIndex) => {
      reports.push({
        id: `sample-report-${product.suffix}-${String(weekIndex).padStart(2, "0")}`,
        watchlistId: id,
        watchlistName: product.name,
        category: product.category,
        frequency: "weekly",
        runAt,
        prices: mockPricesResponse(product.usedMedianBase, itemIndex, weekIndex),
      });
    });
  });

  return { watchlist, reports };
}

export const SAMPLE_AGGREGATION_SUMMARY = {
  itemCount: SAMPLE_PRODUCTS.length,
  periodStart: SAMPLE_PERIOD_START,
  periodEnd: SAMPLE_PERIOD_END,
  staggerWeeks: 1,
  totalReports: buildSampleAggregationData().reports.length,
};

export function isSampleWatchlistId(id: string): boolean {
  return id.startsWith(SAMPLE_ID_PREFIX);
}
