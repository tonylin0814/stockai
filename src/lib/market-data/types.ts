import type { TechnicalSummary } from "@/lib/market-data/indicators";

export type DataQualityState =
  | "fresh"
  | "delayed"
  | "stale"
  | "missing"
  | "conflicting";

export interface Quote {
  symbol: string;
  market: "US" | "TW";
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  source: string;
  qualityState: DataQualityState;
  sourceUpdatedAt: string;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  headline: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: string;
}

export interface Fundamentals {
  pe?: number;
  pb?: number;
  eps?: number;
  marketCap?: number;
  revenueGrowth?: number;
  grossMargin?: number;
  expenseRatio?: number;
  yield?: number;
  ytdReturn?: number;
  threeYearAverageReturn?: number;
  source: string;
  qualityState: DataQualityState;
}

export interface MacroDataPoint {
  date: string;
  value: number;
}

export interface MarketDataProvider {
  getQuote(symbol: string, market: "US" | "TW"): Promise<Quote>;
  getHistory(symbol: string, market: "US" | "TW", days: number): Promise<OHLCV[]>;
  getNews(symbol: string): Promise<NewsItem[]>;
  getFundamentals(symbol: string, market: "US" | "TW"): Promise<Fundamentals>;
  getIndex(symbol: string, market: "US" | "TW"): Promise<Quote>;
  getFXRate(base: string, quote: string): Promise<number>;
  getMacro(seriesId: string): Promise<MacroDataPoint[]>;
}

export type { TechnicalSummary };
