import type { DataQualityState, Fundamentals, Quote } from "@/lib/market-data/types";

export function nowIso() {
  return new Date().toISOString();
}

export function missingQuote(symbol: string, market: "US" | "TW", source: string): Quote {
  return {
    symbol,
    market,
    price: 0,
    change: 0,
    changePct: 0,
    source,
    qualityState: "missing",
    sourceUpdatedAt: nowIso()
  };
}

export function missingFundamentals(source: string): Fundamentals {
  return {
    source,
    qualityState: "missing"
  };
}

export function usQuoteQuality(
  sourceUpdatedAt: string,
  providerDelayMs = 0
): DataQualityState {
  const updated = new Date(sourceUpdatedAt).getTime();
  const ageMs = Date.now() - updated + providerDelayMs;

  if (!Number.isFinite(updated)) {
    return "missing";
  }

  if (ageMs <= 30 * 60 * 1000) {
    return "fresh";
  }

  if (ageMs <= 24 * 60 * 60 * 1000) {
    return "delayed";
  }

  return "stale";
}

export function pctDifference(a: number, b: number) {
  if (!a || !b) {
    return 0;
  }

  return Math.abs(a - b) / ((Math.abs(a) + Math.abs(b)) / 2);
}

export function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
