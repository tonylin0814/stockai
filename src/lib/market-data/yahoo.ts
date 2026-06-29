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
  async getQuoteFromChart(symbol: string, market: "US" | "TW"): Promise<Quote> {
    const source = "Yahoo Finance Chart";
    const querySymbol = yahooSymbol(symbol, market);
    const urls = [
      `${YAHOO_CHART_URL}/${encodeURIComponent(querySymbol)}?range=1d&interval=1m`,
      `${YAHOO_CHART_URL}/${encodeURIComponent(querySymbol)}?range=5d&interval=1d`
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/json",
            "user-agent": "Mozilla/5.0"
          },
          next: { revalidate: 60 }
        });

        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as {
          chart?: {
            result?: Array<{
              timestamp?: number[];
              meta?: {
                regularMarketPrice?: number;
                regularMarketTime?: number;
                previousClose?: number;
                chartPreviousClose?: number;
              };
              indicators?: {
                quote?: Array<{
                  close?: Array<number | null>;
                }>;
              };
            }>;
          };
        };
        const result = data.chart?.result?.[0];
        const timestamps = result?.timestamp ?? [];
        const closes = result?.indicators?.quote?.[0]?.close ?? [];
        let latestIndex = closes.length - 1;

        while (latestIndex >= 0 && !toNumber(closes[latestIndex])) {
          latestIndex -= 1;
        }

        const price =
          latestIndex >= 0
            ? toNumber(closes[latestIndex])
            : toNumber(result?.meta?.regularMarketPrice);

        if (!price) {
          continue;
        }

        const previousClose =
          toNumber(result?.meta?.previousClose) || toNumber(result?.meta?.chartPreviousClose);
        const change = previousClose ? price - previousClose : 0;
        const sourceTimestamp =
          latestIndex >= 0 && timestamps[latestIndex]
            ? timestamps[latestIndex]
            : result?.meta?.regularMarketTime;
        const sourceUpdatedAt = sourceTimestamp
          ? new Date(sourceTimestamp * 1000).toISOString()
          : nowIso();

        return {
          symbol,
          market,
          price,
          change,
          changePct: previousClose ? (change / previousClose) * 100 : 0,
          source,
          qualityState: market === "TW" ? "delayed" : usQuoteQuality(sourceUpdatedAt),
          sourceUpdatedAt
        };
      } catch {
        continue;
      }
    }

    return missingQuote(symbol, market, source);
  }

  async getIndexQuoteFromChart(symbol: string, market: "US" | "TW"): Promise<Quote> {
    return this.getQuoteFromChart(symbol, market);
  }

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
        volume: toNumber(quote.regularMarketVolume) || undefined,
        bid: toNumber(quote.bid) || undefined,
        ask: toNumber(quote.ask) || undefined,
        bidSize: toNumber(quote.bidSize) || undefined,
        askSize: toNumber(quote.askSize) || undefined,
        dayHigh: toNumber(quote.regularMarketDayHigh) || undefined,
        dayLow: toNumber(quote.regularMarketDayLow) || undefined,
        dayOpen: toNumber(quote.regularMarketOpen) || undefined,
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
        expenseRatio: toNumber(
          quote.annualReportExpenseRatio,
          undefined as unknown as number
        ),
        yield: toNumber(quote.yield, undefined as unknown as number),
        ytdReturn: toNumber(quote.ytdReturn, undefined as unknown as number),
        threeYearAverageReturn: toNumber(
          quote.threeYearAverageReturn,
          undefined as unknown as number
        ),
        source: "Yahoo Finance",
        qualityState: "delayed"
      };
    } catch {
      return missingFundamentals("Yahoo Finance");
    }
  }
}
