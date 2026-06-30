# Codex Prompt 34 — Bug Fixes & Market Data Freshness

## Context

This is a Next.js 15 / Supabase app for AI-driven stock portfolio analysis and paper trading simulation. Two AI divisions (GPT and Anthropic) compete by analyzing markets and executing paper trades. Market data comes from Finnhub (US quotes), Yahoo Finance (US/TW fallback and history), and TWSE (Taiwan).

---

## Part 1: Bug Fixes

### Bug 1 — `max_position_pct` config field truncated in `run-trade.ts`

**File:** `src/lib/simulation/run-trade.ts`, line ~548

The call to `executeTrade` passes `maxPositionPct: Number(config.max_positi` — the field name is truncated/wrong. The correct column name in `sim_config` is `max_position_pct` (confirmed in `supabase/migrations/20260630042236_simulation_trading_scoring.sql`).

**Fix:** Change `config.max_positi` → `config.max_position_pct`. Also add a fallback so it doesn't silently produce `NaN`:

```ts
maxPositionPct: Number(config.max_position_pct ?? 0.40),
```

---

### Bug 2 — Dead code: `US_SCAN_UNIVERSE` defined twice in `run-trade.ts`

**File:** `src/lib/simulation/run-trade.ts`

At the top level (~line 90), `const US_SCAN_UNIVERSE` is defined by spreading all three universe arrays. Inside `loadCandidates()` (~line 222), the same spread is done inline again. The top-level `US_SCAN_UNIVERSE` is never read.

**Fix:** Remove the top-level `const US_SCAN_UNIVERSE = [...]` declaration entirely since `loadCandidates` already builds it inline.

---

### Bug 3 — `isWithinTradingHours` uses local server time instead of UTC

**File:** `src/lib/simulation/run-trade.ts`, line ~111

```ts
const hour = now.getHours(); // ❌ local server time
```

The server likely runs UTC. `us_start_hour`/`us_end_hour` in `sim_config` are presumably UTC hours, but `getHours()` returns the server's local timezone. The rest of the app (e.g. `market-hours.ts`) correctly uses UTC methods.

**Fix:**
```ts
const hour = now.getUTCHours(); // ✅ always UTC
```

---

### Bug 4 — `rsi14` is always `null` in paper trading candidate/position data

**File:** `src/lib/simulation/run-trade.ts`, `quoteWithTechnicals()` (~line 245)

```ts
rsi14: null  // hardcoded, never computed
```

The `computeTechnicals()` function in `src/lib/market-data/indicators.ts` already calculates RSI-14 from history. The `quoteWithTechnicals` function fetches 90 days of history but ignores RSI.

**Fix:** Import and call `computeTechnicals` from `@/lib/market-data/indicators`, then return `rsi14` from its output:

```ts
import { computeTechnicals } from "@/lib/market-data/indicators";

async function quoteWithTechnicals(symbol: string, name: string, market: Market) {
  const provider = getMarketDataProvider();
  const quote = await provider.getQuote(symbol, market);
  const history = await provider.getHistory(symbol, market, 90).catch(() => []);
  const technicals = computeTechnicals(history);
  return {
    symbol,
    name,
    quote,
    sma20: technicals.sma20,
    sma60: technicals.sma60 ?? null,
    rsi14: technicals.rsi14
  };
}
```

---

### Bug 5 — `us_day_pnl` in daily report is cumulative P&L, not daily P&L

**File:** `src/lib/simulation/run-report.ts`, lines ~193–199

```ts
us_day_pnl: usPortfolio ? usValue - Number(usPortfolio.starting_cash) : null,
```

This calculates `currentValue - startingCash` which is the **total cumulative return**, not the daily change. The field is named `us_day_pnl` so it should be today's change vs. yesterday.

**Fix:** Before saving the report, query yesterday's `sim_daily_reports` row and compute the delta:

```ts
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().slice(0, 10);

const { data: prevReport } = await supabase
  .from("sim_daily_reports")
  .select("us_portfolio_value, tw_portfolio_value")
  .eq("user_id", userId)
  .eq("division", division)
  .eq("report_date", yesterdayStr)
  .maybeSingle();

const prevUsValue = Number(prevReport?.us_portfolio_value ?? usPortfolio?.starting_cash ?? usValue);
const prevTwValue = Number(prevReport?.tw_portfolio_value ?? twPortfolio?.starting_cash ?? twValue);

// Then in the upsert:
us_day_pnl: usValue - prevUsValue,
tw_day_pnl: twValue - prevTwValue,
us_day_pnl_pct: prevUsValue > 0 ? ((usValue - prevUsValue) / prevUsValue) * 100 : null,
tw_day_pnl_pct: prevTwValue > 0 ? ((twValue - prevTwValue) / prevTwValue) * 100 : null,
```

---

### Bug 6 — Weekly eval uses NASDAQ as US benchmark instead of S&P 500

**File:** `src/lib/simulation/run-weekly.ts`, `benchmarkReturn()` function

```ts
const history = await provider.getHistory(market === "US" ? "^IXIC" : "^TWII", market, 8)
```

`^IXIC` is NASDAQ. The simulation trades broad US equities, so S&P 500 (`^GSPC`) is the correct benchmark. NASDAQ is tech-heavy and skews comparison.

**Fix:** Change `"^IXIC"` → `"^GSPC"`.

---

### Bug 7 — Yahoo Finance `qualityState` for US data doesn't account for provider delay

**File:** `src/lib/market-data/common.ts`, `usQuoteQuality()`

The function marks data "fresh" if age ≤ 30 minutes. But Finnhub's free tier returns 15-minute delayed quotes. This means a quote could be 15–45 minutes stale and still show as "fresh" during market hours.

**Fix:** Accept an optional `providerDelayMs` parameter:

```ts
export function usQuoteQuality(
  sourceUpdatedAt: string,
  providerDelayMs = 0
): DataQualityState {
  const updated = new Date(sourceUpdatedAt).getTime();
  const ageMs = Date.now() - updated + providerDelayMs;
  // ... rest unchanged
}
```

Then in `finnhub.ts`, pass `providerDelayMs: 15 * 60 * 1000` (15 minutes) when calling `usQuoteQuality`. Yahoo Finance real-time endpoints get `providerDelayMs: 0`.

---

## Part 2: Market Data Freshness (Major Improvement)

### Problem

The current data flow has two reliability issues:

1. **Yahoo Finance unofficial APIs** (`query1.finance.yahoo.com/v7/finance/quote` and `/v8/finance/chart`) are not official endpoints. They rate-limit aggressively, return HTTP 429 under load, and have no SLA. When many symbols are fetched in parallel (e.g. `buildDailyDataPackage` fetching 30+ stocks), these endpoints frequently fail silently and fall back to `missingQuote`.

2. **Paper trading uses stale prices**: The quote fetched when scanning candidates is the same one used to execute the trade. There can be several minutes between the scan and when the AI decision comes back. The execution price should be as fresh as possible.

### Solution A — Add Polygon.io as a Primary US Real-Time Source

Polygon.io has a free tier that provides reliable, official US market data (15-minute delayed on free, real-time on paid). It handles rate limits gracefully, supports batching, and has a proper REST API.

**Add `POLYGON_API_KEY` to `.env.local`** (free key from polygon.io).

**Create `src/lib/market-data/polygon.ts`:**

```ts
import { missingQuote, nowIso, toNumber, usQuoteQuality } from "@/lib/market-data/common";
import type { Quote } from "@/lib/market-data/types";

const BASE = "https://api.polygon.io";

export class PolygonProvider {
  private apiKey = process.env.POLYGON_API_KEY;

  async getQuote(symbol: string): Promise<Quote> {
    if (!this.apiKey) return missingQuote(symbol, "US", "Polygon");

    try {
      // v2/last/trade gives the most recent trade price
      const res = await fetch(
        `${BASE}/v2/last/trade/${encodeURIComponent(symbol)}?apiKey=${this.apiKey}`,
        { cache: "no-store" }
      );
      if (!res.ok) return missingQuote(symbol, "US", "Polygon");

      const data = (await res.json()) as {
        results?: { p?: number; t?: number };
        status?: string;
      };
      const price = toNumber(data.results?.p);
      if (!price) return missingQuote(symbol, "US", "Polygon");

      // Polygon free tier: timestamp is nanoseconds
      const tsMs = data.results?.t ? Math.floor(data.results.t / 1_000_000) : Date.now();
      const sourceUpdatedAt = new Date(tsMs).toISOString();

      // Free tier is 15-min delayed — pass that to quality check
      const qualityState = usQuoteQuality(sourceUpdatedAt, 15 * 60 * 1000);

      return {
        symbol,
        market: "US",
        price,
        change: 0,      // last trade doesn't include change; enriched below
        changePct: 0,
        source: "Polygon",
        qualityState,
        sourceUpdatedAt
      };
    } catch {
      return missingQuote(symbol, "US", "Polygon");
    }
  }

  async getQuoteWithChange(symbol: string): Promise<Quote> {
    if (!this.apiKey) return missingQuote(symbol, "US", "Polygon");

    try {
      // v2/snapshot gives price + prev close + change%
      const res = await fetch(
        `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${this.apiKey}`,
        { cache: "no-store" }
      );
      if (!res.ok) return this.getQuote(symbol);

      const data = (await res.json()) as {
        ticker?: {
          day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
          lastTrade?: { p?: number; t?: number };
          prevDay?: { c?: number };
          todaysChangePerc?: number;
          todaysChange?: number;
        };
      };

      const t = data.ticker;
      if (!t) return this.getQuote(symbol);

      const price = toNumber(t.lastTrade?.p) || toNumber(t.day?.c);
      if (!price) return missingQuote(symbol, "US", "Polygon");

      const prevClose = toNumber(t.prevDay?.c);
      const tsMs = t.lastTrade?.t ? Math.floor(t.lastTrade.t / 1_000_000) : Date.now();
      const sourceUpdatedAt = new Date(tsMs).toISOString();

      return {
        symbol,
        market: "US",
        price,
        change: toNumber(t.todaysChange),
        changePct: toNumber(t.todaysChangePerc),
        dayHigh: toNumber(t.day?.h) || undefined,
        dayLow: toNumber(t.day?.l) || undefined,
        dayOpen: toNumber(t.day?.o) || undefined,
        volume: toNumber(t.day?.v) || undefined,
        source: "Polygon",
        qualityState: usQuoteQuality(sourceUpdatedAt, 15 * 60 * 1000),
        sourceUpdatedAt
      };
    } catch {
      return this.getQuote(symbol);
    }
  }
}
```

**Update `src/lib/market-data/provider.ts`** — wire Polygon into `CompositeProvider.getQuote()` for US market:

```ts
import { PolygonProvider } from "@/lib/market-data/polygon";

class CompositeProvider implements MarketDataProvider {
  private finnhub = new FinnhubProvider();
  private yahoo = new YahooProvider();
  private polygon = new PolygonProvider();
  // ...

  async getQuote(symbol: string, market: "US" | "TW"): Promise<Quote> {
    if (market === "TW") {
      // existing TW logic unchanged
    }

    // US: try Polygon first (official API, reliable), then Finnhub, then Yahoo
    const [polygonQuote, finnhubQuote] = await Promise.all([
      this.polygon.getQuoteWithChange(symbol).catch(() => missingQuote(symbol, "US", "Polygon")),
      this.finnhub.getQuote(symbol).catch(() => missingQuote(symbol, "US", "Finnhub"))
    ]);

    // Prefer the fresher quote
    const bestQuote = (() => {
      const candidates = [polygonQuote, finnhubQuote].filter(
        (q) => q.qualityState !== "missing" && q.price > 0
      );
      if (!candidates.length) {
        // Fallback to Yahoo
        return null;
      }
      // Prefer "fresh" over "delayed", break ties by most recent sourceUpdatedAt
      candidates.sort((a, b) => {
        const order = { fresh: 0, delayed: 1, conflicting: 2, stale: 3, missing: 4 };
        const diff = (order[a.qualityState] ?? 4) - (order[b.qualityState] ?? 4);
        if (diff !== 0) return diff;
        return new Date(b.sourceUpdatedAt).getTime() - new Date(a.sourceUpdatedAt).getTime();
      });
      return candidates[0];
    })();

    if (bestQuote) return bestQuote;

    // Yahoo fallback
    const [yahooQuote, yahooChartQuote] = await Promise.all([
      this.yahoo.getQuote(symbol, "US"),
      this.yahoo.getQuoteFromChart(symbol, "US")
    ]);
    const yahooFinal =
      yahooQuote.qualityState !== "missing" ? yahooQuote : yahooChartQuote;
    return yahooFinal;
  }
```

---

### Solution B — Refresh Quote Immediately Before Executing Each Paper Trade

**File:** `src/lib/simulation/run-trade.ts`, `executeTrade()` function

Currently the quote used to execute a trade is the same one fetched during the candidate scan (before the AI makes its decision). There can be 30–60 seconds of latency while the AI runs. For paper trading accuracy, fetch a fresh quote right before writing the trade to the DB.

**Inside `executeTrade()`, add a quote refresh step:**

```ts
async function executeTrade(params: { ... }) {
  if (decision.action === "hold") return false;
  if (decision.market !== params.portfolio.market) return false;

  // Refresh quote immediately before execution to get the most current price
  const provider = getMarketDataProvider();
  const freshQuote = await provider.getQuote(decision.symbol, decision.market).catch(() => params.quote);
  const executionQuote =
    freshQuote.qualityState !== "missing" && freshQuote.price > 0 ? freshQuote : params.quote;

  if (executionQuote.qualityState === "missing" || executionQuote.price <= 0) return false;

  // Replace params.quote with executionQuote in all downstream calculations
  // ... rest of function uses executionQuote instead of params.quote
```

This ensures the recorded `price_per_share` reflects the actual price at execution time, not the scan price.

---

### Solution C — Rate-Limit Parallel Yahoo Requests in `buildDailyDataPackage`

**File:** `src/lib/analysis/data-package.ts`

The function fires 30+ parallel Yahoo Finance requests simultaneously (`Promise.all` over holdings, watchlist, scan universe). This triggers Yahoo rate limits, causing silent failures.

**Add a simple concurrency limiter:**

```ts
async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
```

Then replace quote/history fetches in `buildDailyDataPackage`:

```ts
// Instead of Promise.all([...holdingRows.map(...), ...watchlistRows.map(...)]):
const allSymbolTasks = [
  ...holdingRows.map((row) => () => provider.getQuote(...)),
  ...watchlistRows.map((row) => () => provider.getQuote(...))
];
const allQuotes = await pLimit(allSymbolTasks, 5); // max 5 concurrent
```

Use concurrency of 5 for quotes, 3 for history (history is heavier).

---

## Part 3: Minor Code Quality Improvements

### Improvement 1 — Frankfurter FX rate should warn when returning 0

**File:** `src/lib/market-data/frankfurter.ts`

When the FX rate is 0 (both endpoints failed), the app silently uses 0 for USD/TWD conversion. This causes incorrect portfolio value calculations. Add a console warning and consider returning a last-known fallback or throwing so callers can handle it.

### Improvement 2 — `buildDailyDataPackage` TW scan always runs regardless of TW market hours

**File:** `src/lib/analysis/data-package.ts`

The full `TW_SCAN_UNIVERSE` is always fetched even when only doing a US analysis. Consider gating it:

```ts
import { isTwMarketOpen } from "@/lib/market-hours";

// Only fetch TW scan during or after TW market hours
const shouldScanTw = isTwMarketOpen() || new Date().getUTCHours() >= 6; // after TWSE close
```

### Improvement 3 — FRED macro data caches for 1 hour; should be longer

**File:** `src/lib/market-data/fred.ts`

```ts
{ next: { revalidate: 3600 } } // 1 hour
```

FRED publishes the 10-year yield (`DGS10`) once per business day. Caching 1 hour is fine but 6 hours (`21600`) would reduce unnecessary API calls without any data freshness cost.

### Improvement 4 — Yahoo `getFundamentals` caches for 60 seconds; should be longer

**File:** `src/lib/market-data/yahoo.ts`, `getFundamentals()`

```ts
{ next: { revalidate: 60 } } // 60 seconds
```

Fundamentals (P/E, EPS, market cap) don't change intra-day. Cache for 3600 seconds (1 hour):

```ts
{ next: { revalidate: 3600 } }
```

---

## Bug 8 — Division manager and committee use wrong model by default

**Files:** `src/lib/analysis/pipeline/division.ts`, `src/lib/analysis/pipeline/committee.ts`

Both files contain an identical `getAnalysisModel()` function that defaults to `gpt-4o-mini` / `claude-haiku` unless `ANALYSIS_ECONOMY_MODE=false` is set:

```ts
function getAnalysisModel(provider: string, configuredModel: string): string {
  if (process.env.ANALYSIS_ECONOMY_MODE === "false") return configuredModel;
  return provider === "Anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini";
}
```

This is backwards. The division manager (Monica / Claire) synthesizes all 5 team reports to make the final division decision — the most complex reasoning task in the entire pipeline. The committee then synthesizes both division decisions. These are the two steps that most need the strongest model, yet both default to the cheapest model.

The correct behaviour is to always use the model configured in the `divisions` table (`gpt-5.5` for Monica, `claude-sonnet-4-6` for Claire). There is no legitimate reason to downgrade these two steps.

**Fix — `src/lib/analysis/pipeline/division.ts`:**

Remove the `getAnalysisModel()` function entirely. Replace the one usage:

```ts
// Before:
const analysisModel = getAnalysisModel(
  params.division.model_provider,
  params.division.model_name
);

// After:
const analysisModel = params.division.model_name;
```

**Fix — `src/lib/analysis/pipeline/committee.ts`:**

Remove the `getAnalysisModel()` function entirely. Replace the one usage:

```ts
// Before:
const committeeModel = getAnalysisModel(model.model_provider, model.model_name);

// After:
const committeeModel = model.model_name;
```

Also remove the `ANALYSIS_ECONOMY_MODE` environment variable from `.env.example` or any documentation if it exists, as this flag no longer has any effect.

---

## Summary of Changes

| File | Change Type | Priority |
|------|-------------|----------|
| `src/lib/simulation/run-trade.ts` | Fix `max_position_pct` typo | 🔴 Critical |
| `src/lib/simulation/run-trade.ts` | Remove duplicate `US_SCAN_UNIVERSE` | 🟡 Minor |
| `src/lib/simulation/run-trade.ts` | Fix `getHours()` → `getUTCHours()` | 🟠 Bug |
| `src/lib/simulation/run-trade.ts` | Fix `rsi14: null` → compute from history | 🟠 Bug |
| `src/lib/simulation/run-trade.ts` | Refresh quote before executing trade | 🟠 Improvement |
| `src/lib/simulation/run-report.ts` | Fix `us_day_pnl` to be daily, not cumulative | 🟠 Bug |
| `src/lib/simulation/run-weekly.ts` | Change benchmark `^IXIC` → `^GSPC` | 🟠 Bug |
| `src/lib/market-data/common.ts` | Add `providerDelayMs` to `usQuoteQuality` | 🟠 Bug |
| `src/lib/analysis/pipeline/division.ts` | Division manager always uses configured model | 🔴 Critical |
| `src/lib/analysis/pipeline/committee.ts` | Committee always uses configured model | 🔴 Critical |
| `src/lib/market-data/polygon.ts` | **New file** — Polygon.io provider | 🟢 Major Feature |
| `src/lib/market-data/provider.ts` | Wire Polygon as primary US source | 🟢 Major Feature |
| `src/lib/analysis/data-package.ts` | Add concurrency limiter for parallel fetches | 🟢 Improvement |
| `src/lib/market-data/fred.ts` | Increase cache to 6 hours | 🟡 Minor |
| `src/lib/market-data/yahoo.ts` | Increase fundamentals cache to 1 hour | 🟡 Minor |

**New env var required:** `POLYGON_API_KEY` — free key from https://polygon.io (no credit card needed for free tier).
