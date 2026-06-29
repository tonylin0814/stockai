import {
  missingFundamentals,
  missingQuote,
  nowIso,
  toNumber,
  usQuoteQuality
} from "@/lib/market-data/common";
import type { Fundamentals, OHLCV, Quote } from "@/lib/market-data/types";

const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

function yahooSymbol(symbol: string, market: "US" | "TW") {
  if (market === "TW" && !symbol.endsWith(".TW")) {
    return `${symbol}.TW`;
  }

  return symbol;
}

export class YahooProvider {
  async getQuote(symbol: string, market: "US" | "TW"): Promise<Quote> {
    const source = "Yahoo Finance";

    try {
      const querySymbol = yahooSymbol(symbol, market);
      const response = await fetch(
        `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(querySymbol)}`,
        { next: { revalidate: 300 } }
      );

      if (!response.ok) {
        return missingQuote(symbol, market, source);
      }

      const data = (await response.json()) as {
        quoteResponse?: {
          result?: Array<Record<string, unknown>>;
        };
      };
      const quote = data.quoteResponse?.result?.[0];

      if (!quote) {
        return missingQuote(symbol, market, source);
      }

      const price = toNumber(quote.regularMarketPrice);

      if (!price) {
        return missingQuote(symbol, market, source);
      }

      const marketTime = toNumber(quote.regularMarketTime);
      const sourceUpdatedAt = marketTime
        ? new Date(marketTime * 1000).toISOString()
        : nowIso();

      return {
        symbol,
        market,
        price,
        change: toNumber(quote.regularMarketChange),
        changePct: toNumber(quote.regularMarketChangePercent),
        volume: toNumber(quote.regularMarketVolume),
        source,
        qualityState: market === "TW" ? "delayed" : usQuoteQuality(sourceUpdatedAt),
        sourceUpdatedAt
      };
    } catch {
      return missingQuote(symbol, market, source);
    }
  }

  async getHistory(symbol: string, market: "US" | "TW", days: number): Promise<OHLCV[]> {
    try {
      const querySymbol = yahooSymbol(symbol, market);
      const response = await fetch(
        `${YAHOO_CHART_URL}/${encodeURIComponent(querySymbol)}?range=${days}d&interval=1d`,
        { next: { revalidate: 300 } }
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open?: number[];
                high?: number[];
                low?: number[];
                close?: number[];
                volume?: number[];
              }>;
            };
          }>;
        };
      };
      const result = data.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];

      if (!result?.timestamp || !quote) {
        return [];
      }

      return result.timestamp.map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: toNumber(quote.open?.[index]),
        high: toNumber(quote.high?.[index]),
        low: toNumber(quote.low?.[index]),
        close: toNumber(quote.close?.[index]),
        volume: toNumber(quote.volume?.[index])
      }));
    } catch {
      return [];
    }
  }

  async getFundamentals(symbol: string, market: "US" | "TW"): Promise<Fundamentals> {
    try {
      const querySymbol = yahooSymbol(symbol, market);
      const response = await fetch(
        `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(querySymbol)}`,
        { next: { revalidate: 300 } }
      );

      if (!response.ok) {
        return missingFundamentals("Yahoo Finance");
      }

      const data = (await response.json()) as {
        quoteResponse?: {
          result?: Array<Record<string, unknown>>;
        };
      };
      const quote = data.quoteResponse?.result?.[0];

      if (!quote) {
        return missingFundamentals("Yahoo Finance");
      }

      return {
        pe: toNumber(quote.trailingPE, undefined as unknown as number),
        eps: toNumber(quote.epsTrailingTwelveMonths, undefined as unknown as number),
        marketCap: toNumber(quote.marketCap, undefined as unknown as number),
        source: "Yahoo Finance",
        qualityState: "delayed"
      };
    } catch {
      return missingFundamentals("Yahoo Finance");
    }
  }
}
