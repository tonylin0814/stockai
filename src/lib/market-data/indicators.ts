import type { OHLCV } from "@/lib/market-data/types";

export type TechnicalSummary = {
  currentPrice: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  priceVsSma20Pct: number | null;
  priceVsSma50Pct: number | null;
  trendDirection: "uptrend" | "downtrend" | "sideways" | "insufficient_data";
  high52w: number | null;
  low52w: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  change1w: number | null;
  change1m: number | null;
  change3m: number | null;
  avgVolume20d: number | null;
  dataPoints: number;
};

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  return slice.reduce((sum, close) => sum + close, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const recent = changes.slice(-period);
  const gains = recent.filter((change) => change > 0);
  const losses = recent.filter((change) => change < 0).map(Math.abs);
  const avgGain = gains.length
    ? gains.reduce((sum, gain) => sum + gain, 0) / period
    : 0;
  const avgLoss = losses.length
    ? losses.reduce((sum, loss) => sum + loss, 0) / period
    : 0;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function pctChange(from: number, to: number): number | null {
  if (!from) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeTechnicals(history: OHLCV[]): TechnicalSummary {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map((day) => day.close).filter((close) => close > 0);
  const volumes = sorted.map((day) => day.volume).filter((volume) => volume > 0);
  const n = closes.length;

  if (n === 0) {
    return {
      currentPrice: 0,
      sma20: null,
      sma50: null,
      sma200: null,
      rsi14: null,
      priceVsSma20Pct: null,
      priceVsSma50Pct: null,
      trendDirection: "insufficient_data",
      high52w: null,
      low52w: null,
      pctFrom52wHigh: null,
      pctFrom52wLow: null,
      change1w: null,
      change1m: null,
      change3m: null,
      avgVolume20d: null,
      dataPoints: 0
    };
  }

  const current = closes[n - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r14 = rsi(closes, 14);

  let trendDirection: TechnicalSummary["trendDirection"] = "sideways";
  if (s20 && s50) {
    if (current > s20 && s20 > s50) {
      trendDirection = "uptrend";
    } else if (current < s20 && s20 < s50) {
      trendDirection = "downtrend";
    }
  } else if (s20) {
    trendDirection = current > s20 ? "uptrend" : "downtrend";
  } else {
    trendDirection = "insufficient_data";
  }

  const yearCloses = closes.slice(-252);
  const high52w = Math.max(...yearCloses);
  const low52w = Math.min(...yearCloses);
  const recentVolumes = volumes.slice(-20);
  const avgVolume20d = recentVolumes.length
    ? Math.round(recentVolumes.reduce((sum, volume) => sum + volume, 0) / recentVolumes.length)
    : null;

  return {
    currentPrice: current,
    sma20: s20 ? rounded(s20) : null,
    sma50: s50 ? rounded(s50) : null,
    sma200: s200 ? rounded(s200) : null,
    rsi14: r14,
    priceVsSma20Pct: s20 ? pctChange(s20, current) : null,
    priceVsSma50Pct: s50 ? pctChange(s50, current) : null,
    trendDirection,
    high52w: rounded(high52w),
    low52w: rounded(low52w),
    pctFrom52wHigh: pctChange(high52w, current),
    pctFrom52wLow: pctChange(low52w, current),
    change1w: n > 5 ? pctChange(closes[n - 6], current) : null,
    change1m: n > 21 ? pctChange(closes[n - 22], current) : null,
    change3m: n > 63 ? pctChange(closes[n - 64], current) : null,
    avgVolume20d,
    dataPoints: n
  };
}
