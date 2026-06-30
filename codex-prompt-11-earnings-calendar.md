# Codex Prompt 11 — Earnings Calendar (財報日曆警示)

**Goal**: Inject upcoming earnings dates for portfolio and watchlist stocks into the AI pipeline, so agents can proactively warn about pre-earnings volatility, recommend position sizing adjustments, and avoid entering positions right before binary events.

**Apply after**: Prompts 01–10 applied.

---

## Background

Finnhub provides a free earnings calendar endpoint:
```
GET https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD&symbol=AAPL&token=xxx
```

Response shape:
```json
{
  "earningsCalendar": [
    {
      "date": "2026-08-06",
      "epsEstimate": 1.23,
      "revenueEstimate": 12345678000,
      "hour": "amc",
      "quarter": 2,
      "year": 2026,
      "symbol": "AAPL"
    }
  ]
}
```

- `hour`: `"bmo"` = before market open, `"amc"` = after market close, `"dmh"` = during market hours
- Taiwan stocks: Finnhub won't have data — skip silently, no error
- We fetch 45 days forward so agents can warn about near-term events

---

## Step 1: Create `src/lib/market-data/earnings-calendar.ts`

```typescript
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export type EarningsEvent = {
  symbol: string;
  date: string;        // "YYYY-MM-DD"
  daysUntil: number;   // calculated from today
  quarter: number;
  year: number;
  hour: "bmo" | "amc" | "dmh" | null; // before/after/during market
  epsEstimate: number | null;
  revenueEstimate: number | null;
};

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysFromToday(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Fetches upcoming earnings for a single US stock symbol.
 * Returns null if no earnings found or on error (silent fail).
 * Looks 45 days forward.
 */
async function fetchEarningsForSymbol(
  symbol: string,
  apiKey: string
): Promise<EarningsEvent | null> {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const url = `${FINNHUB_BASE_URL}/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1 hour
    if (!res.ok) return null;

    const data = (await res.json()) as {
      earningsCalendar?: Array<{
        date?: string;
        quarter?: number;
        year?: number;
        hour?: string;
        epsEstimate?: number | null;
        revenueEstimate?: number | null;
        symbol?: string;
      }>;
    };

    const events = data.earningsCalendar ?? [];
    if (!events.length) return null;

    // Take the nearest upcoming event
    const next = events[0];
    if (!next.date) return null;

    const daysUntil = daysFromToday(next.date);
    if (daysUntil < 0) return null; // already passed

    return {
      symbol,
      date: next.date,
      daysUntil,
      quarter: next.quarter ?? 0,
      year: next.year ?? new Date().getFullYear(),
      hour: (next.hour as EarningsEvent["hour"]) ?? null,
      epsEstimate: toNum(next.epsEstimate),
      revenueEstimate: toNum(next.revenueEstimate),
    };
  } catch {
    return null;
  }
}

/**
 * Fetches upcoming earnings for multiple symbols in parallel.
 * Silently skips symbols with no data (Taiwan stocks, ETFs, etc.).
 * Only fetches for US market symbols.
 */
export async function getUpcomingEarnings(
  symbols: Array<{ symbol: string; market: string }>
): Promise<EarningsEvent[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  // Only US stocks (not ETFs broadly — Finnhub still has some ETF earnings data)
  const usSymbols = symbols
    .filter((s) => s.market === "US")
    .map((s) => s.symbol);

  if (!usSymbols.length) return [];

  const results = await Promise.all(
    usSymbols.map((symbol) => fetchEarningsForSymbol(symbol, apiKey))
  );

  return results
    .filter((event): event is EarningsEvent => event !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
```

---

## Step 2: Add `upcomingEarnings` to `DailyDataPackage`

In `src/lib/analysis/data-package.ts`:

**2a. Add import:**
```typescript
import { getUpcomingEarnings, type EarningsEvent } from "@/lib/market-data/earnings-calendar";
```

**2b. Add to `DailyDataPackage` type:**
```typescript
export type DailyDataPackage = {
  packageDate: string;
  userId: string;
  portfolio: PortfolioItem[];
  watchlist: WatchlistItem[];
  marketSnapshot: { ... };
  dataQualitySummary: { ... };
  upcomingEarnings: EarningsEvent[]; // ADD THIS
};
```

**2c. In `buildDailyDataPackage()`, fetch earnings alongside existing parallel fetches.**

Find where the big `Promise.all` block runs (fetching histories, fundamentals, news). Add earnings fetch to the same parallel block, or add it separately before the return:

```typescript
// Collect all symbols with their markets
const allSymbolsWithMarket = [
  ...portfolio.map((item) => ({ symbol: item.symbol, market: item.market })),
  ...watchlist.map((item) => ({ symbol: item.symbol, market: item.market })),
];

const upcomingEarnings = await getUpcomingEarnings(allSymbolsWithMarket);
```

Then include in the returned object:
```typescript
return {
  // ... existing fields ...
  upcomingEarnings,
};
```

---

## Step 3: Add earnings formatting to `compactMarketSummary`

In `src/lib/analysis/prompts/common.ts`, inside `compactMarketSummary()`, add an earnings section after the market snapshot:

```typescript
export function compactMarketSummary(dataPackage: DailyDataPackage): string {
  // ... existing code ...

  // ADD: Earnings calendar section
  function formatEarningsCalendar(events: EarningsEvent[]): string {
    if (!events.length) return "";

    const lines = ["## 即將到來的財報（45天內）"];

    for (const e of events) {
      const urgency =
        e.daysUntil <= 7 ? "⚠️ 本週" :
        e.daysUntil <= 14 ? "📅 兩週內" :
        `📅 ${e.daysUntil}天後`;

      const timing =
        e.hour === "bmo" ? "盤前公布" :
        e.hour === "amc" ? "盤後公布" :
        e.hour === "dmh" ? "盤中公布" : "";

      const eps = e.epsEstimate !== null ? ` | EPS預估 $${e.epsEstimate.toFixed(2)}` : "";

      lines.push(
        `- ${urgency} ${e.symbol}：Q${e.quarter} ${e.year} 財報 ${e.date}${timing ? `（${timing}）` : ""}${eps}`
      );
    }

    return lines.join("\n");
  }

  // Build the full summary string
  // Find where the existing summary is assembled (return statement) and append:
  const earningsSection = formatEarningsCalendar(dataPackage.upcomingEarnings ?? []);

  // Add earningsSection to the returned summary string, after market snapshot, before portfolio items
  // The exact insertion point depends on how compactMarketSummary assembles its output —
  // find the return statement and add:
  // ${earningsSection ? `\n${earningsSection}\n` : ""}
}
```

**Important**: `EarningsEvent` needs to be imported in `common.ts`:
```typescript
import type { EarningsEvent } from "@/lib/market-data/earnings-calendar";
```

---

## Step 4: Add earnings awareness to agent prompts

### 4a. Add `EARNINGS_RISK_GUIDE` constant to `common.ts`

```typescript
export const EARNINGS_RISK_GUIDE = `財報風險管理原則：
若「即將到來的財報」欄位顯示有標的在 14 天內公布財報：
- **7天內（本週）**：高度謹慎。不建議在財報前建立新倉位。若已持有，考慮減少至核心部位（50%以下）或設定保護性停損。財報是二元事件，即使方向看對也可能因預期過高而下跌。
- **8-14天內**：中度謹慎。可持有但不宜追高。若要買進，用小部位（25%以下）先行試探。
- **15-45天內**：低度提醒。正常分析，但在 conditionsToAct 中加入「等待財報確認方向後再加碼」。
特殊情況：若這是公司作為上市公司的**第一次財報**（如 SPCX），不確定性更高，謹慎程度應提升一級。`;
```

### 4b. Inject into `mission-analysis.ts`

In `buildMissionAnalysisPrompt`, after the scanning frameworks, add:

```typescript
${dataPackage.upcomingEarnings?.length ? `
**掃描 6：財報風險評估**
${EARNINGS_RISK_GUIDE}
特別注意：若投資組合中有標的在 7 天內公布財報，這必須成為今日最優先的警示事項。
` : ""}
```

**Add import at top of file:**
```typescript
import { EARNINGS_RISK_GUIDE } from "@/lib/analysis/prompts/common";
```

### 4c. Inject into `portfolio-review.ts`

In `buildPortfolioReviewPrompt`, add after the existing review frameworks:

```typescript
${dataPackage.upcomingEarnings?.length ? `
## 財報風險
${EARNINGS_RISK_GUIDE}
` : ""}
```

### 4d. Inject into `market-scan.ts`

In `buildMarketScanPrompt`, add to the scanning criteria:

```typescript
${dataPackage.upcomingEarnings?.length ? `
## 財報日曆注意事項
掃描關注清單時，若標的有即將到來的財報，在推薦中必須標註財報日期並說明是否建議財報前/後進場。
${EARNINGS_RISK_GUIDE}
` : ""}
```

---

## Step 5: Handle the `decisionMemory` field (if prompt 08 already applied)

If `buildDailyDataPackage` already has a `decisionMemory` field from prompt 08, make sure the new `upcomingEarnings` field is added alongside it, not replacing it.

---

## Verification

After applying:

1. Run `npx tsc --noEmit` — no errors.
2. Test with SPCX in portfolio: run a mission and check `pipeline_agent_runs` prompt — should see:
   ```
   ## 即將到來的財報（45天內）
   ⚠️ 本週 SPCX：Q2 2026 財報 2026-08-06（盤後公布）| EPS預估 $x.xx
   ```
   (or whatever date Finnhub returns)
3. Check mission analysis output — agents should reference the earnings date in their risk assessment.
4. If no earnings found (e.g. Taiwan stocks only), the section simply doesn't appear — correct behavior.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/market-data/earnings-calendar.ts` | **CREATE** — Finnhub earnings calendar fetcher |
| `src/lib/analysis/data-package.ts` | Add `upcomingEarnings: EarningsEvent[]` to type + populate in builder |
| `src/lib/analysis/prompts/common.ts` | Add `formatEarningsCalendar()` to `compactMarketSummary` + add `EARNINGS_RISK_GUIDE` constant |
| `src/lib/analysis/prompts/mission-analysis.ts` | Inject earnings risk section when earnings exist |
| `src/lib/analysis/prompts/portfolio-review.ts` | Inject earnings risk section |
| `src/lib/analysis/prompts/market-scan.ts` | Inject earnings calendar note in scan criteria |
