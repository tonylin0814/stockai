import { FinnhubProvider } from "@/lib/market-data/finnhub";
import { FrankfurterProvider } from "@/lib/market-data/frankfurter";
import { FredProvider } from "@/lib/market-data/fred";
import { missingFundamentals, missingQuote, pctDifference } from "@/lib/market-data/common";
import { PolygonProvider } from "@/lib/market-data/polygon";
import { TwseProvider } from "@/lib/market-data/twse";
import { getTwseFundamentals } from "@/lib/market-data/twse-fundamentals";
import type {
  Fundamentals,
  MarketDataProvider,
  MacroDataPoint,
  NewsItem,
  OHLCV,
  Quote
} from "@/lib/market-data/types";
import { YahooProvider } from "@/lib/market-data/yahoo";

class CompositeProvider implements MarketDataProvider {
  private finnhub = new FinnhubProvider();
  private yahoo = new YahooProvider();
  private polygon = new PolygonProvider();
  private twse = new TwseProvider();
  private frankfurter = new FrankfurterProvider();
  private fred = new FredProvider();

  async getQuote(symbol: string, market: "US" | "TW"): Promise<Quote> {
    if (market === "TW") {
      const chartQuote = await this.yahoo.getQuoteFromChart(symbol, market);
      if (chartQuote.qualityState !== "missing") {
        return chartQuote;
      }

      const yahooQuote = await this.yahoo.getQuote(symbol, market);
      return yahooQuote.qualityState === "missing"
        ? this.twse.getStockQuote(symbol)
        : yahooQuote;
    }

    const [polygonQuote, finnhubQuote] = await Promise.all([
      this.polygon
        .getQuoteWithChange(symbol)
        .catch(() => missingQuote(symbol, "US", "Polygon")),
      this.finnhub.getQuote(symbol).catch(() => missingQuote(symbol, "US", "Finnhub"))
    ]);

    const primaryCandidates = [polygonQuote, finnhubQuote].filter(
      (quote) => quote.qualityState !== "missing" && quote.price > 0
    );

    if (primaryCandidates.length) {
      primaryCandidates.sort((a, b) => {
        const qualityOrder = {
          fresh: 0,
          delayed: 1,
          conflicting: 2,
          stale: 3,
          missing: 4
        };
        const qualityDiff = qualityOrder[a.qualityState] - qualityOrder[b.qualityState];

        if (qualityDiff !== 0) {
          return qualityDiff;
        }

        return new Date(b.sourceUpdatedAt).getTime() - new Date(a.sourceUpdatedAt).getTime();
      });

      return primaryCandidates[0];
    }

    const [yahooQuote, yahooChartQuote] = await Promise.all([
      this.yahoo.getQuote(symbol, "US"),
      this.yahoo.getQuoteFromChart(symbol, "US")
    ]);
    const yahooBestQuote =
      yahooQuote.qualityState === "missing" ? yahooChartQuote : yahooQuote;

    if (
      polygonQuote.qualityState !== "missing" &&
      yahooBestQuote.qualityState !== "missing" &&
      pctDifference(polygonQuote.price, yahooBestQuote.price) > 0.01
    ) {
      return {
        ...polygonQuote,
        source: "Polygon / Yahoo Finance",
        qualityState: "conflicting"
      };
    }

    return yahooBestQuote;
  }

  async getHistory(symbol: string, market: "US" | "TW", days: number): Promise<OHLCV[]> {
    return this.yahoo.getHistory(symbol, market, days);
  }

  async getNews(symbol: string): Promise<NewsItem[]> {
    return this.finnhub.getNews(symbol);
  }

  async getFundamentals(symbol: string, market: "US" | "TW"): Promise<Fundamentals> {
    if (market === "TW") {
      const yahooFundamentals = await this.yahoo.getFundamentals(symbol, market);
      const twse = await getTwseFundamentals(symbol);

      if (!twse) {
        return yahooFundamentals;
      }

      return {
        ...yahooFundamentals,
        pe: twse.peRatio ?? yahooFundamentals.pe,
        pb: twse.pbRatio ?? yahooFundamentals.pb,
        twsePeRatio: twse.peRatio,
        twseDividendYield: twse.dividendYield,
        twsePbRatio: twse.pbRatio,
        monthlyRevenueYoY: null,
        monthlyRevenueNote: null,
        source:
          yahooFundamentals.qualityState === "missing"
            ? "TWSE OpenAPI"
            : `${yahooFundamentals.source} / TWSE OpenAPI`,
        qualityState:
          twse.peRatio || twse.dividendYield || twse.pbRatio
            ? "delayed"
            : yahooFundamentals.qualityState
      };
    }

    const finnhubFundamentals = await this.finnhub.getFundamentals(symbol);

    if (finnhubFundamentals.qualityState !== "missing") {
      return finnhubFundamentals;
    }

    const yahooFundamentals = await this.yahoo.getFundamentals(symbol, market);
    return yahooFundamentals.qualityState === "missing"
      ? missingFundamentals("Finnhub / Yahoo Finance")
      : yahooFundamentals;
  }

  async getIndex(symbol: string, market: "US" | "TW"): Promise<Quote> {
    if (market === "TW") {
      const twseQuote = await this.twse.getTaiex();
      return twseQuote.qualityState === "missing"
        ? this.yahoo.getIndexQuoteFromChart("^TWII", "TW")
        : twseQuote;
    }

    const quote = await this.getQuote(symbol, "US");
    return quote.qualityState === "missing"
      ? missingQuote(symbol, "US", "Finnhub / Yahoo Finance")
      : quote;
  }

  async getFXRate(base: string, quote: string): Promise<number> {
    return this.frankfurter.getFXRate(base, quote);
  }

  async getMacro(seriesId: string): Promise<MacroDataPoint[]> {
    return this.fred.getMacro(seriesId);
  }
}

export function getMarketDataProvider(): MarketDataProvider {
  return new CompositeProvider();
}
