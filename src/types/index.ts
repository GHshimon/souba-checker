export interface Market {
  id: string;
  name: string;
  color: string;
  icon: string;
  url: (query: string) => string;
}

export interface BarcodeResult {
  value: string;
  format: string;
}

export interface CompressedImage {
  dataUrl: string;
  w: number;
  h: number;
  file: File;
  barcode: string | null;
}

export interface Product {
  id: string;
  name: string;
  jan: string | null;
  searchQuery: string;
  source: "barcode" | "ai";
  brand?: string;
  model?: string;
  category?: string;
  confidence?: "high" | "medium" | "low";
}

export interface SimilarProduct {
  name: string;
  brand?: string;
  model?: string;
  relationType?: string;
  differencePoints?: string[];
  riskNote?: string;
  searchQuery?: string;
  links?: {
    rakuten: string;
    yahooShopping: string;
    googleImages: string;
  };
}

export type PriceItemType = "main" | "bundle" | "accessory" | "unknown";

export interface PriceSummary {
  items?: Array<{
    title?: string;
    price: number;
    url?: string;
    site?: "rakuten" | "yahooShopping";
    itemType?: PriceItemType;
    included?: boolean;
    score?: number;
    reasons?: string[];
    /** UI手動上書き（集計対象） */
    includedOverride?: boolean;
  }>;
  matchingQuery?: string;
  min?: number;
  max?: number;
  avg?: number;
  median?: number;
  count?: number;
  currency?: string;
  minUrl?: string;
  minTitle?: string;
  makerFilterApplied?: boolean;
}

export interface HistoryEntry {
  id: string;
  product: Product;
  thumbnail?: string;
  time: string;
  timestamp: number;
}

export interface IdentifyResponse {
  products: Array<{
    product_name: string;
    brand?: string;
    model?: string;
    category?: string;
    search_query: string;
    confidence?: "high" | "medium" | "low";
    jan_code?: string;
    missing_info?: string;
  }>;
  warnings?: string[];
}

export interface JanLookupResponse {
  name: string;
  jan: string;
  imageUrl?: string;
}

export interface PricesResponse {
  rakuten?: PriceSummary | null;
  yahooShopping?: PriceSummary | null;
  rakutenUsed?: PriceSummary | null;
  yahooShoppingUsed?: PriceSummary | null;
  warnings?: string[];
}

export interface SimilarResponse {
  base_product: {
    product_name: string;
    brand?: string;
    model?: string;
    category?: string;
    search_query?: string;
  };
  similar_products: SimilarProduct[];
}

export interface WatchlistItem {
  id: string;
  name: string;
  query: string;
  category: string;
  frequency: "weekly";
  createdAt: number;
  lastAggregatedAt?: number;
}

export interface AggregationReport {
  id: string;
  watchlistId: string;
  watchlistName: string;
  category: string;
  frequency: "weekly";
  runAt: number;
  prices: PricesResponse;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string; format: string }>>;
    };
  }
}
