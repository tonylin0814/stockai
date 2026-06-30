# Codex Prompt 09 — Taiwan Fundamentals Data (台股基本面資料)

**Goal**: Add real fundamental data for Taiwan stocks via TWSE OpenAPI (P/E ratio, dividend yield, P/B ratio) and TWSE monthly revenue (月營收年增率 via MOPS). Currently Taiwan stocks show no fundamentals — agents fall back to "資料不足".

**Apply after**: Prompts 01–08 applied.

---

## Background

The TWSE OpenAPI provides free, no-auth endpoints:

- **BWIBBU_d** — Daily P/E, dividend yield, P/B for all listed stocks:
  `https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d`
  Response shape: `[{ "Code": "2330", "Name": "台積電", "PEratio": "25.36", "DividendYield": "1.82", "PBratio": "6.90" }, ...]`

- **MONTHLY_REVENUE** — Monthly revenue from MOPS (公開資訊觀測站):
  `https://mops.twse.com.tw/mops/web/ajax_t05st10_ifrs`
  This endpoint is POST-based and complex. Use the simpler TWSE alternative instead:
  `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`  ← daily data (not revenue)

  For monthly revenue, use MOPS JSON API:
  `https://mops.twse.com.tw/server-java/t05st10_ifrs?step=1&CO_ID={SYMBOL}&SYEAR={YEAR}&SMONTH={MONTH}&encodeURIComponent=1`
  Response is HTML — complex to parse.

**Decision**: Implement TWSE BWIBBU_d now (high value, easy). Skip MOPS monthly revenue for now — add a placeholder in `Fundamentals` type but populate via a manual calculation from quarterly revenue data if available, otherwise leave null.

---

## Step 1: Create `src/lib/market-data/twse-fundamentals.ts`

```typescript
/**
 * Fetches P/E ratio, dividend yield, and P/B ratio for Taiwan listed stocks
 * from TWSE OpenAPI BWIBBU_d endpoint.
 *
 * This is a batch endpoint — one call returns all stocks.
 * We cache the result for 4 hours to avoid hammering the API.
 */

type TwseFundamental = {
  peRatio: number | null;
  dividendYield: number | null;
  pbRatio: number | null;
};

let twseCache: Map<string, TwseFundamental> | null = null;
let twseCacheExpiry = 0;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function parseNum(s: string | undefined): number | null {
  if (!s || s === "-" || s === "—" || s.trim() === "") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadTwseData(): Promise<Map<string, TwseFundamental>> {
  const url = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d";
  const response = await fetch(url, {
    next: { revalidate: 14400 }, // Next.js cache: 4 hours
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`TWSE BWIBBU_d HTTP ${response.status}`);
  }

  const rows = (await response.json()) as Array<{
    Code?: string;
    PEratio?: string;
    DividendYield?: string;
    PBratio?: string;
  }>;

  const map = new Map<string, TwseFundamental>();
  for (const row of rows) {
    if (!row.Code) continue;
    map.set(row.Code.trim(), {
      peRatio: parseNum(row.PEratio),
      dividendYield: parseNum(row.DividendYield),
      pbRatio: parseNum(row.PBratio),
    });
  }
  return map;
}

export async function getTwseFundamentals(
  symbol: string
): Promise<TwseFundamental | null> {
  // Strip market suffix if present (e.g. "2330.TW" → "2330")
  const code = symbol.split(".")[0];

  const now = Date.now();
  if (!twseCache || now > twseCacheExpiry) {
    try {
      twseCache = await loadTwseData();
      twseCacheExpiry = now + CACHE_TTL_MS;
    } catch (err) {
      console.warn("[twse-fundamentals] Failed to load TWSE data:", err);
      return null;
    }
  }

  return twseCache.get(code) ?? null;
}
```

---

## Step 2: Add Taiwan-specific fields to `Fundamentals` type

In `src/lib/market-data/types.ts` (or wherever `Fundamentals` is defined — search for `type Fundamentals` or `interface Fundamentals`):

Add these optional fields:

```typescript
export type Fundamentals = {
  // ... existing fields ...

  // Taiwan-specific (populated from TWSE OpenAPI for TW market stocks)
  twsePeRatio?: number | null;       // 本益比 (P/E from TWSE)
  twseDividendYield?: number | null; // 殖利率 (%)
  twsePbRatio?: number | null;       // 股價淨值比 (P/B)

  // Monthly revenue trend (月營收年增率) — populated when available
  // Positive = revenue growing YoY, negative = shrinking
  monthlyRevenueYoY?: number | null; // % YoY growth of latest monthly revenue
  monthlyRevenueNote?: string | null; // e.g. "2025-03 月營收年增率 +12.5%"
};
```

---

## Step 3: Update fundamentals fetcher to use TWSE for TW stocks

In `src/lib/market-data/fundamentals.ts` (or the file that exports `getFundamentals(symbol, market)`):

**Add import:**
```typescript
import { getTwseFundamentals } from "@/lib/market-data/twse-fundamentals";
```

**Find the function `getFundamentals(symbol: string, market: string)`.**

Add a branch for Taiwan stocks. After the existing Yahoo Finance / Finnhub fetch, add TWSE data:

```typescript
export async function getFundamentals(
  symbol: string,
  market: string
): Promise<Fundamentals | null> {
  // ... existing logic that builds `result: Fundamentals` ...

  // Augment with TWSE data for Taiwan stocks
  if (market === "TW" || symbol.endsWith(".TW") || symbol.endsWith(".TWO")) {
    try {
      const twse = await getTwseFundamentals(symbol);
      if (twse) {
        result = {
          ...result,
          // Use TWSE P/E as the primary P/E for TW stocks (more accurate than Yahoo)
          peRatio: twse.peRatio ?? result?.peRatio ?? null,
          twsePeRatio: twse.peRatio,
          twseDividendYield: twse.dividendYield,
          twsePbRatio: twse.pbRatio,
        };
      }
    } catch (err) {
      console.warn(`[getFundamentals] TWSE augment failed for ${symbol}:`, err);
    }
  }

  return result;
}
```

**Note**: If `getFundamentals` doesn't currently have a `market` parameter, check how it's called from `data-package.ts` and add the market parameter at both the call site and function signature.

---

## Step 4: Update `compactMarketSummary` to display TWSE fundamentals

In `src/lib/analysis/prompts/common.ts`, find the `formatFundamentals` inner function inside `compactMarketSummary`.

Add TWSE fields to the output:

```typescript
function formatFundamentals(f: Fundamentals | null, market?: string): string {
  if (!f) return "基本面：無資料";

  const lines: string[] = [];

  // For Taiwan stocks, prefer TWSE data
  if (market === "TW" || market === "TWO") {
    if (f.twsePeRatio) lines.push(`本益比(TWSE)：${f.twsePeRatio.toFixed(1)}x`);
    if (f.twseDividendYield) lines.push(`殖利率：${f.twseDividendYield.toFixed(2)}%`);
    if (f.twsePbRatio) lines.push(`股價淨值比：${f.twsePbRatio.toFixed(2)}x`);
    if (f.monthlyRevenueNote) lines.push(f.monthlyRevenueNote);
    else if (f.monthlyRevenueYoY !== null && f.monthlyRevenueYoY !== undefined) {
      const sign = f.monthlyRevenueYoY >= 0 ? "+" : "";
      lines.push(`月營收年增率：${sign}${f.monthlyRevenueYoY.toFixed(1)}%`);
    }
  }

  // Existing fields (for US stocks or as fallback)
  if (f.peRatio && !lines.some((l) => l.includes("本益比"))) {
    lines.push(`P/E：${f.peRatio.toFixed(1)}x`);
  }
  if (f.revenueGrowthYoy) lines.push(`營收年增：${(f.revenueGrowthYoy * 100).toFixed(1)}%`);
  if (f.grossMargin) lines.push(`毛利率：${(f.grossMargin * 100).toFixed(1)}%`);
  if (f.debtToEquity) lines.push(`負債比：${f.debtToEquity.toFixed(2)}`);

  return lines.length ? `基本面：${lines.join("｜")}` : "基本面：有限資料（AI 訓練知識補充）";
}
```

**Also update the call to `formatFundamentals` inside `compactMarketSummary`** to pass the market parameter. Find where portfolio items and watchlist items are formatted and pass `item.market` or `item.quote?.market`:

```typescript
// Before:
formatFundamentals(item.fundamentals)

// After:
formatFundamentals(item.fundamentals, item.market)
```

---

## Step 5: Update `FUNDAMENTAL_QUALITY_GUIDE` for Taiwan context

In `src/lib/analysis/prompts/common.ts`, find `FUNDAMENTAL_QUALITY_GUIDE`. Add a Taiwan-specific Layer 1 section:

```
**Layer 1B（台股 API 資料，若有）：**
- TWSE 本益比：與台股同業比較（電子業合理 15-25x，傳產 10-15x）
- 殖利率：台股散戶重視配息，殖利率 > 5% 通常有支撐
- 股價淨值比：> 3x 需要高成長支撐，< 1x 可能是價值或地雷
- 月營收年增率：台股最重要月報指標，連續 3 個月正成長看多，連續下滑看空
```

Add this after the existing Layer 1 block (which covers US stocks).

---

## Step 6: Monthly Revenue — Future Enhancement Note

The MOPS monthly revenue endpoint (`mops.twse.com.tw`) returns HTML, not JSON. Implementing a full scraper is out of scope for this prompt.

**For now**: Leave `monthlyRevenueYoY` and `monthlyRevenueNote` as `null`. The `FUNDAMENTAL_QUALITY_GUIDE` Layer 2 instructs the AI to use training knowledge about monthly revenue trends for well-known Taiwan stocks (台積電, 聯發科, 鴻海等).

**Future prompt (11)**: Add MOPS scraper once the above is stable.

---

## Verification

After applying:

1. Run `npx tsc --noEmit` — no errors.
2. Run a mission with Taiwan stocks (e.g. 2330.TW, 2454.TW).
3. Check `pipeline_agent_runs` prompt for team agents — should see "本益比(TWSE)：XX.Xx" in market summary.
4. Check that BWIBBU_d endpoint responds: `curl https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d | head -c 500`

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/market-data/twse-fundamentals.ts` | **CREATE** — batch fetch + 4h cache |
| `src/lib/market-data/types.ts` | Add `twsePeRatio`, `twseDividendYield`, `twsePbRatio`, `monthlyRevenueYoY`, `monthlyRevenueNote` to `Fundamentals` |
| `src/lib/market-data/fundamentals.ts` | Add TWSE augmentation for TW market stocks |
| `src/lib/analysis/prompts/common.ts` | Update `formatFundamentals` + `FUNDAMENTAL_QUALITY_GUIDE` |
