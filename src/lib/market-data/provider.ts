import { FinnhubProvider } from "@/lib/market-data/finnhub";
import { FrankfurterProvider } from "@/lib/market-data/frankfurter";
import { FredProvider } from "@/lib/market-data/fred";
import { missingFundamentals, missingQuote, pctDifference } from "@/lib/market-data/common";
import { TwseProvider } from "@/lib/market-data/twse";
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
  private twse = new TwseProvider();
  private frankfurter = new FrankfurterProvider();
  private fred = new FredProvider();

  async getQuote(symbol: string, market: "US" | "TW"): Promise<Quote> {
    if (market === "TW") {
      const yahooQuote = await this.yahoo.getQuote(symbol, market);
      return yahooQuote.qualityState === "missing"
        ? this.twse.getStockQuote(symbol)
        : yahooQuote;
    }

    const [finnhubQuote, yahooQuote] = await Promise.all([
      this.finnhub.getQuote(symbol),
      this.yahoo.getQuote(symbol, "US")
    ]);

    if (
      finnhubQuote.qualityState !== "missing" &&
      yahooQuote.qualityState !== "missing" &&
      pctDifference(finnhubQuote.price, yahooQuote.price) > 0.01
    ) {
      return {
        ...finnhubQuote,
        source: "Finnhub / Yahoo Finance",
        qualityState: "conflicting"
      };
    }

    return finnhubQuote.qualityState === "missing" ? yahooQuote : finnhubQuote;
  }

  async getHistory(symbol: string, market: "US" | "TW", days: number): Promise<OHLCV[]> {
    return this.yahoo.getHistory(symbol, market, days);
  }

  async getNews(symbol: string): Promise<NewsItem[]> {
    return this.finnhub.getNews(symbol);
  }

  async getFundamentals(symbol: string, market: "US" | "TW"): Promise<Fundamentals> {
    if (market === "TW") {
      return this.yahoo.getFundamentals(symbol, market);
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
      const yahooQuote = await this.yahoo.getIndexQuoteFromChart("^TWII", "TW");
      return yahooQuote.qualityState === "missing" ? this.twse.getTaiex() : yahooQuote;
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
