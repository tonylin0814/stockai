import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildDecisionMemory } from "@/lib/analysis/decision-memory";
import { TW_SCAN_UNIVERSE } from "@/lib/analysis/tw-universe";
import { isTwMarketOpen } from "@/lib/market-hours";
import { missingQuote } from "@/lib/market-data/common";
import { computeTechnicals } from "@/lib/market-data/indicators";
import {
  getUpcomingEarnings,
  type EarningsEvent
} from "@/lib/market-data/earnings-calendar";
import type { WebResearchResult } from "@/lib/analysis/web-research";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { TechnicalSummary } from "@/lib/market-data/indicators";
import type {
  Fundamentals,
  MacroDataPoint,
  NewsItem,
  Quote
} from "@/lib/market-data/types";

export type PortfolioItem = {
  id: string;
  symbol: string;
  market: "US" | "TW";
  name: string;
  securityType: string;
  shares: number;
  averageCost: number;
  costCurrency: string;
  strategy: string | null;
  notes: string | null;
  currentPrice: number;
  quote: Quote;
  technicals: TechnicalSummary;
  fundamentals: Fundamentals | null;
  news: NewsItem[];
};

export type WatchlistItem = {
  id: string;
  symbol: string;
  market: "US" | "TW";
  name: string;
  securityType: string;
  reason: string | null;
  targetBuyPrice: number | null;
  alertPrice: number | null;
  status: string | null;
  visibility: string;
  notes: string | null;
  currentPrice: number;
  quote: Quote;
  technicals: TechnicalSummary;
  fundamentals: Fundamentals | null;
  news: NewsItem[];
};

export type TwScanItem = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
  sma20: number | null;
  sma60: number | null;
  rsi14: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
};

export type DailyDataPackage = {
  packageDate: string;
  userId: string;
  portfolio: PortfolioItem[];
  watchlist: WatchlistItem[];
  marketSnapshot: {
    taiex: Quote;
    sp500: Quote;
    nasdaq: Quote;
    dow: Quote;
    vix: Quote;
    usdTwd: number;
    tenYearYield: MacroDataPoint | null;
  };
  dataQualitySummary: {
    hasMissingData: boolean;
    hasStaleData: boolean;
    hasConflictingData: boolean;
    missingItems: string[];
  };
  decisionMemory: string;
  upcomingEarnings: EarningsEvent[];
  webResearch: WebResearchResult | null;
  twScanUniverse: TwScanItem[];
};

type HoldingRow = {
  id: string;
  shares: number;
  average_cost: number;
  cost_currency: string;
  strategy: string | null;
  notes: string | null;
  securities: {
    symbol: string;
    market: string;
    name: string;
    security_type: string;
  } | null;
};

type WatchlistRow = {
  id: string;
  visibility: string;
  reason: string | null;
  target_buy_price: number | null;
  alert_price: number | null;
  status: string | null;
  notes: string | null;
  securities: {
    symbol: string;
    market: string;
    name: string;
    security_type: string;
  } | null;
};

function isMarket(value: string): value is "US" | "TW" {
  return value === "US" || value === "TW";
}

function summarizeQuality(quotes: Array<{ label: string; quote: Quote }>) {
  const states = quotes.map((item) => item.quote.qualityState);

  return {
    hasMissingData: states.includes("missing"),
    hasStaleData: states.includes("stale"),
    hasConflictingData: states.includes("conflicting"),
    missingItems: quotes
      .filter((item) => item.quote.qualityState === "missing")
      .map((item) => `${item.label} 缺少資料`)
  };
}

function averageClose(history: Array<{ close: number }>, period: number) {
  const closes = history.map((day) => day.close).filter((close) => close > 0);

  if (closes.length < period) {
    return null;
  }

  const slice = closes.slice(-period);
  return Math.round((slice.reduce((sum, close) => sum + close, 0) / period) * 100) / 100;
}

async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index;
      index += 1;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );
  return results;
}

async function logQualityIssues(
  userId: string,
  quotes: Array<{ label: string; quote: Quote }>
) {
  const supabase = createSupabaseServiceClient();
  const issues = quotes.filter((item) =>
    ["missing", "stale"].includes(item.quote.qualityState)
  );

  if (!issues.length) {
    return;
  }

  const sourceNames = Array.from(new Set(issues.map((item) => item.quote.source)));
  const { data: sources } = await supabase
    .from("data_sources")
    .select("id, name")
    .in("name", sourceNames);
  const sourceIdByName = new Map(
    ((sources ?? []) as Array<{ id: string; name: string }>).map((source) => [
      source.name,
      source.id
    ])
  );

  await supabase.from("data_fetch_logs").insert(
    issues.map((item) => ({
      source_id: sourceIdByName.get(item.quote.source) ?? null,
      fetch_type: "daily_package",
      status: item.quote.qualityState,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error_message: `${item.label}: ${item.quote.source} ${item.quote.qualityState} for user ${userId}`,
      rows_inserted: 0
    }))
  );
}

export async function buildDailyDataPackage(userId: string): Promise<DailyDataPackage> {
  const supabase = createSupabaseServiceClient();
  const provider = getMarketDataProvider();
  const packageDate = new Date().toISOString().slice(0, 10);

  const [holdingsResult, watchlistResult] = await Promise.all([
    supabase
      .from("portfolio_holdings")
      .select(
        "id, shares, average_cost, cost_currency, strategy, notes, securities(symbol, market, name, security_type)"
      )
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("watchlist_items")
      .select(
        "id, visibility, reason, target_buy_price, alert_price, status, notes, securities(symbol, market, name, security_type)"
      )
      .eq("user_id", userId)
  ]);

  if (holdingsResult.error) {
    throw new Error(holdingsResult.error.message);
  }

  if (watchlistResult.error) {
    throw new Error(watchlistResult.error.message);
  }

  const holdingRows = (holdingsResult.data ?? []) as unknown as HoldingRow[];
  const watchlistRows = (watchlistResult.data ?? []) as unknown as WatchlistRow[];

  const holdingQuoteTasks = holdingRows.map((row) => {
    const security = row.securities;
    return () =>
      security && isMarket(security.market)
        ? provider.getQuote(security.symbol, security.market)
        : Promise.resolve(missingQuote("", "US", "Invalid security"));
  });
  const watchlistQuoteTasks = watchlistRows.map((row) => {
    const security = row.securities;
    return () =>
      security && isMarket(security.market)
        ? provider.getQuote(security.symbol, security.market)
        : Promise.resolve(missingQuote("", "US", "Invalid security"));
  });
  const holdingHistoryTasks = holdingRows.map((row) => {
    const security = row.securities;
    return () =>
      security && isMarket(security.market)
        ? provider.getHistory(security.symbol, security.market, 252)
        : Promise.resolve([]);
  });
  const watchlistHistoryTasks = watchlistRows.map((row) => {
    const security = row.securities;
    return () =>
      security && isMarket(security.market)
        ? provider.getHistory(security.symbol, security.market, 252)
        : Promise.resolve([]);
  });
  const holdingFundamentalTasks = holdingRows.map((row) => {
    const security = row.securities;
    return () =>
      security && isMarket(security.market)
        ? provider.getFundamentals(security.symbol, security.market)
        : Promise.resolve(null);
  });
  const watchlistFundamentalTasks = watchlistRows.map((row) => {
    const security = row.securities;
    return () =>
      security && isMarket(security.market)
        ? provider.getFundamentals(security.symbol, security.market)
        : Promise.resolve(null);
  });
  const holdingNewsTasks = holdingRows.map((row) => {
    const security = row.securities;
    return () =>
      security?.market === "US" ? provider.getNews(security.symbol) : Promise.resolve([]);
  });
  const watchlistNewsTasks = watchlistRows.map((row) => {
    const security = row.securities;
    return () =>
      security?.market === "US" ? provider.getNews(security.symbol) : Promise.resolve([]);
  });

  const [
    quoteResults,
    taiex,
    sp500,
    nasdaq,
    dow,
    vix,
    usdTwd,
    dgs10,
    historyResults,
    fundamentalResults,
    newsResults
  ] = await Promise.all([
    pLimit([...holdingQuoteTasks, ...watchlistQuoteTasks], 5),
    provider.getIndex("TAIEX", "TW"),
    provider.getIndex("^GSPC", "US"),
    provider.getIndex("^IXIC", "US"),
    provider.getIndex("^DJI", "US"),
    provider.getIndex("^VIX", "US"),
    provider.getFXRate("USD", "TWD"),
    provider.getMacro("DGS10"),
    pLimit([...holdingHistoryTasks, ...watchlistHistoryTasks], 3),
    pLimit([...holdingFundamentalTasks, ...watchlistFundamentalTasks], 3),
    pLimit([...holdingNewsTasks, ...watchlistNewsTasks], 5)
  ]);
  const holdingQuotes = quoteResults.slice(0, holdingRows.length);
  const watchlistQuotes = quoteResults.slice(holdingRows.length);
  const holdingHistories = historyResults.slice(0, holdingRows.length);
  const watchlistHistories = historyResults.slice(holdingRows.length);
  const holdingFundamentals = fundamentalResults.slice(0, holdingRows.length);
  const watchlistFundamentals = fundamentalResults.slice(holdingRows.length);
  const holdingNews = newsResults.slice(0, holdingRows.length);
  const watchlistNews = newsResults.slice(holdingRows.length);

  const portfolio: PortfolioItem[] = holdingRows.flatMap((row, index) => {
    const security = row.securities;

    if (!security || !isMarket(security.market)) {
      return [];
    }

    const quote = holdingQuotes[index];
    const history = holdingHistories[index] ?? [];
    const fundamentals = holdingFundamentals[index] ?? null;
    const news = (holdingNews[index] ?? []).slice(0, 5);

    return [
      {
        id: row.id,
        symbol: security.symbol,
        market: security.market,
        name: security.name,
        securityType: security.security_type,
        shares: Number(row.shares),
        averageCost: Number(row.average_cost),
        costCurrency: row.cost_currency,
        strategy: row.strategy,
        notes: row.notes,
        currentPrice: quote.price,
        quote,
        technicals: computeTechnicals(history),
        fundamentals,
        news
      }
    ];
  });

  const watchlist: WatchlistItem[] = watchlistRows.flatMap((row, index) => {
    const security = row.securities;

    if (!security || !isMarket(security.market)) {
      return [];
    }

    const quote = watchlistQuotes[index];
    const history = watchlistHistories[index] ?? [];
    const fundamentals = watchlistFundamentals[index] ?? null;
    const news = (watchlistNews[index] ?? []).slice(0, 5);

    return [
      {
        id: row.id,
        symbol: security.symbol,
        market: security.market,
        name: security.name,
        securityType: security.security_type,
        reason: row.reason,
        targetBuyPrice: row.target_buy_price,
        alertPrice: row.alert_price,
        status: row.status,
        visibility: row.visibility,
        notes: row.notes,
        currentPrice: quote.price,
        quote,
        technicals: computeTechnicals(history),
        fundamentals,
        news
      }
    ];
  });

  const excludedSymbols = new Set([
    ...holdingRows.map((row) => row.securities?.symbol).filter(Boolean),
    ...watchlistRows.map((row) => row.securities?.symbol).filter(Boolean)
  ]);
  const shouldScanTw = isTwMarketOpen() || new Date().getUTCHours() >= 6;
  const scanCandidates = shouldScanTw
    ? TW_SCAN_UNIVERSE.filter((candidate) => !excludedSymbols.has(candidate.symbol))
    : [];
  const [scanQuotes, scanHistories] = await Promise.all([
    pLimit(
      scanCandidates.map((candidate) => () =>
        provider.getQuote(candidate.symbol, "TW").catch(() => null)
      ),
      5
    ),
    pLimit(
      scanCandidates.map((candidate) => () =>
        provider.getHistory(candidate.symbol, "TW", 252).catch(() => [])
      ),
      3
    )
  ]);
  const twScanUniverse: TwScanItem[] = scanCandidates.flatMap((candidate, index) => {
    const quote = scanQuotes[index];

    if (!quote || quote.qualityState === "missing" || quote.price === 0) {
      return [];
    }

    const history = scanHistories[index] ?? [];
    const technicals = computeTechnicals(history);

    return [
      {
        symbol: candidate.symbol,
        name: candidate.name,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume ?? null,
        sma20: technicals.sma20,
        sma60: averageClose(history, 60),
        rsi14: technicals.rsi14,
        weekHigh52: technicals.high52w,
        weekLow52: technicals.low52w
      }
    ];
  });

  const quoteItems = [
    ...portfolio.map((item) => ({ label: `portfolio ${item.symbol}`, quote: item.quote })),
    ...watchlist.map((item) => ({ label: `watchlist ${item.symbol}`, quote: item.quote })),
    { label: "TAIEX", quote: taiex },
    { label: "S&P 500", quote: sp500 },
    { label: "NASDAQ", quote: nasdaq },
    { label: "Dow Jones", quote: dow },
    { label: "VIX", quote: vix }
  ];
  const dataQualitySummary = summarizeQuality(quoteItems);
  const allSymbols = [
    ...portfolio.map((item) => item.symbol),
    ...watchlist.map((item) => item.symbol)
  ];
  const allSymbolsWithMarket = [
    ...portfolio.map((item) => ({ symbol: item.symbol, market: item.market })),
    ...watchlist.map((item) => ({ symbol: item.symbol, market: item.market }))
  ];
  const [decisionMemory, upcomingEarnings] = await Promise.all([
    buildDecisionMemory(userId, allSymbols),
    getUpcomingEarnings(allSymbolsWithMarket)
  ]);

  await logQualityIssues(userId, quoteItems);

  return {
    packageDate,
    userId,
    portfolio,
    watchlist,
    marketSnapshot: {
      taiex,
      sp500,
      nasdaq,
      dow,
      vix,
      usdTwd,
      tenYearYield: dgs10[0] ?? null
    },
    dataQualitySummary,
    decisionMemory,
    upcomingEarnings,
    webResearch: null,
    twScanUniverse
  };
}
