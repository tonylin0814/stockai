import { missingQuote, toNumber, usQuoteQuality } from "@/lib/market-data/common";
import type { Quote } from "@/lib/market-data/types";

const POLYGON_BASE_URL = "https://api.polygon.io";
const POLYGON_DELAY_MS = 15 * 60 * 1000;

export class PolygonProvider {
  private apiKey = process.env.POLYGON_API_KEY;

  async getQuote(symbol: string): Promise<Quote> {
    if (!this.apiKey) {
      return missingQuote(symbol, "US", "Polygon");
    }

    try {
      const response = await fetch(
        `${POLYGON_BASE_URL}/v2/last/trade/${encodeURIComponent(symbol)}?apiKey=${this.apiKey}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        return missingQuote(symbol, "US", "Polygon");
      }

      const data = (await response.json()) as {
        results?: { p?: number; t?: number };
      };
      const price = toNumber(data.results?.p);

      if (!price) {
        return missingQuote(symbol, "US", "Polygon");
      }

      const tsMs = data.results?.t ? Math.floor(data.results.t / 1_000_000) : Date.now();
      const sourceUpdatedAt = new Date(tsMs).toISOString();

      return {
        symbol,
        market: "US",
        price,
        change: 0,
        changePct: 0,
        source: "Polygon",
        qualityState: usQuoteQuality(sourceUpdatedAt, POLYGON_DELAY_MS),
        sourceUpdatedAt
      };
    } catch {
      return missingQuote(symbol, "US", "Polygon");
    }
  }

  async getQuoteWithChange(symbol: string): Promise<Quote> {
    if (!this.apiKey) {
      return missingQuote(symbol, "US", "Polygon");
    }

    try {
      const response = await fetch(
        `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${this.apiKey}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        return this.getQuote(symbol);
      }

      const data = (await response.json()) as {
        ticker?: {
          day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
          lastTrade?: { p?: number; t?: number };
          prevDay?: { c?: number };
          todaysChangePerc?: number;
          todaysChange?: number;
        };
      };
      const ticker = data.ticker;

      if (!ticker) {
        return this.getQuote(symbol);
      }

      const price = toNumber(ticker.lastTrade?.p) || toNumber(ticker.day?.c);

      if (!price) {
        return missingQuote(symbol, "US", "Polygon");
      }

      const tsMs = ticker.lastTrade?.t
        ? Math.floor(ticker.lastTrade.t / 1_000_000)
        : Date.now();
      const sourceUpdatedAt = new Date(tsMs).toISOString();

      return {
        symbol,
        market: "US",
        price,
        change: toNumber(ticker.todaysChange),
        changePct: toNumber(ticker.todaysChangePerc),
        dayHigh: toNumber(ticker.day?.h) || undefined,
        dayLow: toNumber(ticker.day?.l) || undefined,
        dayOpen: toNumber(ticker.day?.o) || undefined,
        volume: toNumber(ticker.day?.v) || undefined,
        source: "Polygon",
        qualityState: usQuoteQuality(sourceUpdatedAt, POLYGON_DELAY_MS),
        sourceUpdatedAt
      };
    } catch {
      return this.getQuote(symbol);
    }
  }
}
