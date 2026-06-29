import {
  missingFundamentals,
  missingQuote,
  nowIso,
  toNumber,
  usQuoteQuality
} from "@/lib/market-data/common";
import type { Fundamentals, NewsItem, Quote } from "@/lib/market-data/types";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export class FinnhubProvider {
  private apiKey = process.env.FINNHUB_API_KEY;

  async getQuote(symbol: string): Promise<Quote> {
    if (!this.apiKey) {
      return missingQuote(symbol, "US", "Finnhub");
    }

    try {
      const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;
      const response = await fetch(url, { next: { revalidate: 60 } });

      if (!response.ok) {
        return missingQuote(symbol, "US", "Finnhub");
      }

      const data = (await response.json()) as {
        c?: number;
        d?: number;
        dp?: number;
        pc?: number;
        h?: number;
        l?: number;
        o?: number;
        t?: number;
      };
      const price = toNumber(data.c) || toNumber(data.pc);

      if (!price) {
        return missingQuote(symbol, "US", "Finnhub");
      }

      const sourceUpdatedAt = data.t ? new Date(data.t * 1000).toISOString() : nowIso();

      return {
        symbol,
        market: "US",
        price,
        change: toNumber(data.d),
        changePct: toNumber(data.dp),
        dayHigh: toNumber(data.h) || undefined,
        dayLow: toNumber(data.l) || undefined,
        dayOpen: toNumber(data.o) || undefined,
        source: "Finnhub",
        qualityState: usQuoteQuality(sourceUpdatedAt),
        sourceUpdatedAt
      };
    } catch {
      return missingQuote(symbol, "US", "Finnhub");
    }
  }

  async getNews(symbol: string): Promise<NewsItem[]> {
    if (!this.apiKey) {
      return [];
    }

    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 7);

    try {
      const params = new URLSearchParams({
        symbol,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        token: this.apiKey
      });
      const response = await fetch(`${FINNHUB_BASE_URL}/company-news?${params}`, {
        next: { revalidate: 60 }
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as Array<{
        headline?: string;
        summary?: string;
        url?: string;
        source?: string;
        datetime?: number;
      }>;

      return data.slice(0, 10).map((item) => ({
        headline: item.headline ?? "",
        summary: item.summary,
        url: item.url ?? "",
        source: item.source ?? "Finnhub",
        publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : nowIso()
      }));
    } catch {
      return [];
    }
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    if (!this.apiKey) {
      return missingFundamentals("Finnhub");
    }

    try {
      const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${this.apiKey}`;
      const response = await fetch(url, { next: { revalidate: 60 } });

      if (!response.ok) {
        return missingFundamentals("Finnhub");
      }

      const data = (await response.json()) as {
        metric?: Record<string, unknown>;
      };

      if (!data.metric) {
        return missingFundamentals("Finnhub");
      }

      return {
        pe: toNumber(data.metric.peNormalizedAnnual, undefined as unknown as number),
        pb: toNumber(data.metric.pbAnnual, undefined as unknown as number),
        eps: toNumber(data.metric.epsInclExtraItemsAnnual, undefined as unknown as number),
        marketCap: toNumber(data.metric.marketCapitalization, undefined as unknown as number),
        revenueGrowth: toNumber(data.metric.revenueGrowth3Y, undefined as unknown as number),
        grossMargin: toNumber(data.metric.grossMarginAnnual, undefined as unknown as number),
        source: "Finnhub",
        qualityState: "delayed"
      };
    } catch {
      return missingFundamentals("Finnhub");
    }
  }
}
