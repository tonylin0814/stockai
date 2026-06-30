# Codex Task: Data Enrichment — Add Historical Trends, Technicals, Fundamentals & News to Data Package

## Problem

`buildDailyDataPackage()` currently only fetches the current price quote for each stock. The functions `getHistory()`, `getFundamentals()`, and `getNews()` all exist in the provider but are never called. AI agents receive no historical trend data, no technical indicators, no PE/EPS, and no news — making real analysis impossible.

## Goal

Enrich each portfolio and watchlist item in `DailyDataPackage` with:
1. **Technical summary** — SMA20, SMA50, RSI14, 52W high/low position, trend direction (computed from 90-day OHLCV history)
2. **Fundamentals** — PE, EPS, market cap, gross margin (from Finnhub/Yahoo)
3. **Recent news** — last 5 headlines with date (from Finnhub)

Do NOT send raw OHLCV arrays to agents — compute the indicators and send only the summary values to keep token count manageable.

---

## Step 1: Create `src/lib/market-data/indicators.ts`

Create this new file:

```typescript
import type { OHLCV } from "@/lib/market-data/types";

export type TechnicalSummary = {
  // Price position
  currentPrice: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  // Momentum
  rsi14: number | null;
  // Trend
  priceVsSma20Pct: number | null;   // % above/below SMA20
  priceVsSma50Pct: number | null;   // % above/below SMA50
  trendDirection: "uptrend" | "downtrend" | "sideways" | "insufficient_data";
  // Range
  high52w: number | null;
  low52w: number | null;
  pctFrom52wHigh: number | null;    // negative = below high
  pctFrom52wLow: number | null;     // positive = above low
  // Recent performance
  change1w: number | null;          // % change last 5 trading days
  change1m: number | null;          // % change last 21 trading days
  change3m: number | null;          // % change last 63 trading days
  // Volume
  avgVolume20d: number | null;
  dataPoints: number;               // how many days of data we have
};

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0);
  const losses = recent.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / period : 0;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function pctChange(from: number, to: number): number {
  return Math.round(((to - from) / from) * 1000) / 10; // one decimal
}

export function computeTechnicals(history: OHLCV[]): TechnicalSummary {
  // Sort oldest to newest
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map(d => d.close).filter(c => c > 0);
  const volumes = sorted.map(d => d.volume).filter(v => v > 0);
  const n = closes.length;

  if (n === 0) {
    return {
      currentPrice: 0,
      sma20: null, sma50: null, sma200: null,
      rsi14: null,
      priceVsSma20Pct: null, priceVsSma50Pct: null,
      trendDirection: "insufficient_data",
      high52w: null, low52w: null,
      pctFrom52wHigh: null, pctFrom52wLow: null,
      change1w: null, change1m: null, change3m: null,
      avgVolume20d: null,
      dataPoints: 0,
    };
  }

  const current = closes[n - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r14 = rsi(closes, 14);

  // Trend: price vs moving averages
  let trendDirection: TechnicalSummary["trendDirection"] = "sideways";
  if (s20 && s50) {
    if (current > s20 && s20 > s50) trendDirection = "uptrend";
    else if (current < s20 && s20 < s50) trendDirection = "downtrend";
    else trendDirection = "sideways";
  } else if (s20) {
    trendDirection = current > s20 ? "uptrend" : "downtrend";
  } else {
    trendDirection = "insufficient_data";
  }

  // 52W high/low (use all available data, max 252 trading days)
  const yearCloses = closes.slice(-252);
  const high52w = Math.max(...yearCloses);
  const low52w = Math.min(...yearCloses);

  // Volume
  const recentVols = volumes.slice(-20);
  const avgVolume20d = recentVols.length
    ? Math.round(recentVols.reduce((a, b) => a + b, 0) / recentVols.length)
    : null;

  return {
    currentPrice: current,
    sma20: s20 ? Math.round(s20 * 100) / 100 : null,
    sma50: s50 ? Math.round(s50 * 100) / 100 : null,
    sma200: s200 ? Math.round(s200 * 100) / 100 : null,
    rsi14: r14,
    priceVsSma20Pct: s20 ? pctChange(s20, current) : null,
    priceVsSma50Pct: s50 ? pctChange(s50, current) : null,
    trendDirection,
    high52w: Math.round(high52w * 100) / 100,
    low52w: Math.round(low52w * 100) / 100,
    pctFrom52wHigh: pctChange(high52w, current),
    pctFrom52wLow: pctChange(low52w, current),
    change1w: n >= 5 ? pctChange(closes[n - 6], current) : null,
    change1m: n >= 21 ? pctChange(closes[n - 22], current) : null,
    change3m: n >= 63 ? pctChange(closes[n - 64], current) : null,
    avgVolume20d,
    dataPoints: n,
  };
}
```

---

## Step 2: Update `src/lib/market-data/types.ts`

Add `TechnicalSummary` re-export and update `MarketDataProvider` interface. At the top of the file, add this import:

```typescript
import type { TechnicalSummary } from "@/lib/market-data/indicators";
```

Then add `TechnicalSummary` to the exports at the bottom:

```typescript
export type { TechnicalSummary };
```

---

## Step 3: Update `src/lib/analysis/data-package.ts`

### 3a. Add new imports at the top

```typescript
import { computeTechnicals } from "@/lib/market-data/indicators";
import type { TechnicalSummary } from "@/lib/market-data/indicators";
import type { Fundamentals, NewsItem } from "@/lib/market-data/types";
```

### 3b. Add fields to `PortfolioItem` type

Add these three fields after `quote: Quote`:

```typescript
  technicals: TechnicalSummary;
  fundamentals: Fundamentals | null;
  news: NewsItem[];
```

### 3c. Add fields to `WatchlistItem` type

Add the same three fields after `quote: Quote`:

```typescript
  technicals: TechnicalSummary;
  fundamentals: Fundamentals | null;
  news: NewsItem[];
```

### 3d. Update `buildDailyDataPackage` to fetch enrichment data

In `buildDailyDataPackage`, AFTER the `holdingRows` and `watchlistRows` are loaded from Supabase, fetch all enrichment data in parallel alongside the existing quote fetches.

Replace the existing parallel fetch block (starting with `const [holdingQuotes, watchlistQuotes, taiex, ...`) with this:

```typescript
  // Collect all unique symbols to avoid duplicate fetches for history/fundamentals/news
  const holdingSymbols = holdingRows.flatMap(row => {
    const s = row.securities;
    return s && isMarket(s.market) ? [{ symbol: s.symbol, market: s.market as "US" | "TW" }] : [];
  });
  const watchlistSymbols = watchlistRows.flatMap(row => {
    const s = row.securities;
    return s && isMarket(s.market) ? [{ symbol: s.symbol, market: s.market as "US" | "TW" }] : [];
  });
  const allSymbols = [...holdingSymbols, ...watchlistSymbols];

  const [
    holdingQuotes,
    watchlistQuotes,
    taiex, sp500, nasdaq, dow, vix, usdTwd, dgs10,
    holdingHistories,
    watchlistHistories,
    holdingFundamentals,
    watchlistFundamentals,
    holdingNews,
    watchlistNews,
  ] = await Promise.all([
    // Existing: current quotes
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
    // Existing: market indices
    provider.getIndex("TAIEX", "TW"),
    provider.getIndex("^GSPC", "US"),
    provider.getIndex("^IXIC", "US"),
    provider.getIndex("^DJI", "US"),
    provider.getIndex("^VIX", "US"),
    provider.getFXRate("USD", "TWD"),
    provider.getMacro("DGS10"),
    // NEW: 90-day price history for technicals
    Promise.all(
      holdingRows.map((row) => {
        const s = row.securities;
        return s && isMarket(s.market)
          ? provider.getHistory(s.symbol, s.market, 90)
          : Promise.resolve([]);
      })
    ),
    Promise.all(
      watchlistRows.map((row) => {
        const s = row.securities;
        return s && isMarket(s.market)
          ? provider.getHistory(s.symbol, s.market, 90)
          : Promise.resolve([]);
      })
    ),
    // NEW: fundamentals
    Promise.all(
      holdingRows.map((row) => {
        const s = row.securities;
        return s && isMarket(s.market)
          ? provider.getFundamentals(s.symbol, s.market)
          : Promise.resolve(null);
      })
    ),
    Promise.all(
      watchlistRows.map((row) => {
        const s = row.securities;
        return s && isMarket(s.market)
          ? provider.getFundamentals(s.symbol, s.market)
          : Promise.resolve(null);
      })
    ),
    // NEW: recent news (US stocks only — Finnhub news is US-only)
    Promise.all(
      holdingRows.map((row) => {
        const s = row.securities;
        return s && s.market === "US"
          ? provider.getNews(s.symbol)
          : Promise.resolve([]);
      })
    ),
    Promise.all(
      watchlistRows.map((row) => {
        const s = row.securities;
        return s && s.market === "US"
          ? provider.getNews(s.symbol)
          : Promise.resolve([]);
      })
    ),
  ]);
```

### 3e. Update portfolio item construction

Replace the `portfolio` mapping to include the new fields:

```typescript
  const portfolio: PortfolioItem[] = holdingRows.flatMap((row, index) => {
    const security = row.securities;
    if (!security || !isMarket(security.market)) return [];

    const quote = holdingQuotes[index];
    const history = holdingHistories[index] ?? [];
    const fundamentals = holdingFundamentals[index] ?? null;
    const news = (holdingNews[index] ?? []).slice(0, 5); // max 5 news items

    return [{
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
      news,
    }];
  });
```

### 3f. Update watchlist item construction

```typescript
  const watchlist: WatchlistItem[] = watchlistRows.flatMap((row, index) => {
    const security = row.securities;
    if (!security || !isMarket(security.market)) return [];

    const quote = watchlistQuotes[index];
    const history = watchlistHistories[index] ?? [];
    const fundamentals = watchlistFundamentals[index] ?? null;
    const news = (watchlistNews[index] ?? []).slice(0, 5);

    return [{
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
      news,
    }];
  });
```

---

## Step 4: Update `src/lib/analysis/prompts/common.ts`

Update the `compactMarketSummary` function to include technicals, fundamentals, and news for each holding and watchlist item.

Replace the `compactMarketSummary` function with:

```typescript
export function compactMarketSummary(dataPackage: DailyDataPackage): string {
  const snap = dataPackage.marketSnapshot;

  function formatTechnicals(t: import("@/lib/market-data/indicators").TechnicalSummary): string {
    if (t.dataPoints < 5) return "技術資料不足";
    const parts: string[] = [];
    if (t.rsi14 !== null) parts.push(`RSI=${t.rsi14}`);
    if (t.sma20 !== null) parts.push(`SMA20=${t.sma20}`);
    if (t.sma50 !== null) parts.push(`SMA50=${t.sma50}`);
    if (t.trendDirection !== "insufficient_data") parts.push(`趨勢=${t.trendDirection}`);
    if (t.pctFrom52wHigh !== null) parts.push(`距52W高點${t.pctFrom52wHigh}%`);
    if (t.change1w !== null) parts.push(`1W=${t.change1w}%`);
    if (t.change1m !== null) parts.push(`1M=${t.change1m}%`);
    if (t.change3m !== null) parts.push(`3M=${t.change3m}%`);
    return parts.join(" ") || "無技術資料";
  }

  function formatFundamentals(f: import("@/lib/market-data/types").Fundamentals | null): string {
    if (!f || f.qualityState === "missing") return "基本面資料不足";
    const parts: string[] = [];
    if (f.pe) parts.push(`PE=${f.pe.toFixed(1)}`);
    if (f.eps) parts.push(`EPS=${f.eps.toFixed(2)}`);
    if (f.grossMargin) parts.push(`毛利率=${(f.grossMargin * 100).toFixed(1)}%`);
    if (f.marketCap) parts.push(`市值=${(f.marketCap / 1e9).toFixed(1)}B`);
    return parts.join(" ") || "基本面資料不足";
  }

  function formatNews(news: import("@/lib/market-data/types").NewsItem[]): string {
    if (!news.length) return "無近期新聞";
    return news.slice(0, 3).map(n =>
      `[${n.publishedAt.slice(0, 10)}] ${n.headline}`
    ).join(" | ");
  }

  const portfolio = (dataPackage.portfolio ?? []).map(h =>
    `${h.symbol}(${h.market}) 持股${h.shares}股 成本${h.averageCost} 現價${h.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(h.technicals)}\n  基本面：${formatFundamentals(h.fundamentals)}\n  新聞：${formatNews(h.news)}`
  ).join("\n");

  const watchlist = (dataPackage.watchlist ?? []).map(w =>
    `${w.symbol}(${w.market}) 目標買入${w.targetBuyPrice ?? "N/A"} 現價${w.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(w.technicals)}\n  基本面：${formatFundamentals(w.fundamentals)}\n  新聞：${formatNews(w.news)}`
  ).join("\n");

  return `日期：${dataPackage.packageDate}
市場指標：TAIEX ${snap?.taiex?.price ?? "N/A"} | S&P500 ${snap?.sp500?.price ?? "N/A"} | VIX ${snap?.vix?.price ?? "N/A"} | USD/TWD ${snap?.usdtwd ?? "N/A"} | 10Y美債 ${snap?.tenYearYield?.value ?? "N/A"}%
持股：
${portfolio || "無"}
關注清單：
${watchlist || "無"}
資料品質：${JSON.stringify(dataPackage.dataQualitySummary ?? {})}`;
}
```

---

## Step 5: Fix NVDA weekend/closed-market bug in `src/lib/market-data/finnhub.ts`

In `getQuote`, change:

```typescript
const data = (await response.json()) as {
  c?: number;
  d?: number;
  dp?: number;
  t?: number;
};
const price = toNumber(data.c);
```

To:

```typescript
const data = (await response.json()) as {
  c?: number;
  d?: number;
  dp?: number;
  pc?: number;   // previous close — valid even when market is closed
  t?: number;
};
// data.c is 0 when market is closed; fall back to previous close (pc)
const price = toNumber(data.c) || toNumber(data.pc);
```

---

## Verification

Run `npx tsc --noEmit` — confirm zero errors.

The most likely TypeScript issue is that `compactMarketSummary` in `common.ts` now references `h.technicals`, `h.fundamentals`, and `h.news` — these must match the updated `PortfolioItem` and `WatchlistItem` types in `data-package.ts`. If TypeScript complains about the inline import types inside `compactMarketSummary`, move the import to the top of the file:

```typescript
import type { TechnicalSummary } from "@/lib/market-data/indicators";
import type { Fundamentals, NewsItem } from "@/lib/market-data/types";
```

Then replace the inline `import(...)` references with those types directly.

After compiling, run one test mission. You should see that:
1. NVDA returns the previous close price on weekends (not 0.00)  
2. Each stock in the agent output now has RSI, trend direction, 1W/1M/3M performance
3. Agent confidence scores should rise because they have actual data to work with
