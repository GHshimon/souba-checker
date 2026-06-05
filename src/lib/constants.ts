import type { CSSProperties } from "react";
import type { Market } from "../types";

/** 流動量・落札相場の参考リンク（APIなし） */
export const LIQUIDITY_MARKETS: Market[] = [
  {
    id: "yahoo_closed",
    name: "ヤフオク落札相場",
    color: "#ff6633",
    icon: "📊",
    url: (q) => `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(q)}`,
  },
  {
    id: "aucfan",
    name: "オークファン",
    color: "#2563eb",
    icon: "📈",
    url: (q) => `https://aucfan.com/search1/new/?keyword=${encodeURIComponent(q)}`,
  },
  {
    id: "mercari_sold",
    name: "メルカリ（売切）",
    color: "#4dc9f6",
    icon: "🏷️",
    url: (q) => `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}&status=sold_out`,
  },
  {
    id: "priceboard",
    name: "プライスボード",
    color: "#7c3aed",
    icon: "💹",
    url: (q) => `https://www.priceboard.jp/s/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    id: "yahoo_active",
    name: "ヤフオク出品中",
    color: "#ea580c",
    icon: "🔨",
    url: (q) => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}`,
  },
];

export const MARKETS: Market[] = [
  {
    id: "rakuten",
    name: "楽天市場",
    color: "#bf0000",
    icon: "🛒",
    url: (q) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,
  },
  {
    id: "yahoo",
    name: "ヤフオク",
    color: "#ff6633",
    icon: "🔨",
    url: (q) => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}`,
  },
  {
    id: "amazon",
    name: "Amazon",
    color: "#ff9900",
    icon: "📦",
    url: (q) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`,
  },
  {
    id: "mercari",
    name: "メルカリ",
    color: "#4dc9f6",
    icon: "🏷️",
    url: (q) => `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    id: "yahoo_shop",
    name: "Yahoo!ショッピング",
    color: "#ff0033",
    icon: "🛍️",
    url: (q) => `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(q)}`,
  },
];

export const T = {
  bg: "#fafaf8",
  surface: "#fff",
  border: "#e5e2db",
  text: "#1a1a1a",
  muted: "#7a7a72",
  accent: "#2563eb",
  accentBg: "#eff4ff",
  success: "#16a34a",
  successBg: "#f0fdf4",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  warn: "#d97706",
  warnBg: "#fffbeb",
  font: "'DM Sans', 'Noto Sans JP', -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
  radius: 12,
} as const;

export function btnStyle(bg: string, color: string, border?: string): CSSProperties {
  return {
    padding: "10px 20px",
    borderRadius: 10,
    background: bg,
    color,
    border: border ? `1px solid ${border}` : "none",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: T.font,
  };
}
