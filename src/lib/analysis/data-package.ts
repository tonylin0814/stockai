import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { DataQualityState, MacroDataPoint, Quote } from "@/lib/market-data/types";

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

  const [holdingQuotes, watchlistQuotes, taiex, sp500, nasdaq, dow, vix, usdTwd, dgs10] =
    await Promise.all([
      Promise.all(
        holdingRows.map((row) => {
          const security = row.securities;
          return security && isMarket(security.market)
            ? provider.getQuote(security.symbol, security.market)
            : Promise.resolve(provider.getQuote("", "US"));
        })
      ),
      Promise.all(
        watchlistRows.map((row) => {
          const security = row.securities;
          return security && isMarket(security.market)
            ? provider.getQuote(security.symbol, security.market)
            : Promise.resolve(provider.getQuote("", "US"));
        })
      ),
      provider.getIndex("TAIEX", "TW"),
      provider.getIndex("^GSPC", "US"),
      provider.getIndex("^IXIC", "US"),
      provider.getIndex("^DJI", "US"),
      provider.getIndex("^VIX", "US"),
      provider.getFXRate("USD", "TWD"),
      provider.getMacro("DGS10")
    ]);

  const portfolio: PortfolioItem[] = holdingRows.flatMap((row, index) => {
    const security = row.securities;

    if (!security || !isMarket(security.market)) {
      return [];
    }

    const quote = holdingQuotes[index];

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
        quote
      }
    ];
  });

  const watchlist: WatchlistItem[] = watchlistRows.flatMap((row, index) => {
    const security = row.securities;

    if (!security || !isMarket(security.market)) {
      return [];
    }

    const quote = watchlistQuotes[index];

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
        quote
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
    dataQualitySummary
  };
}
