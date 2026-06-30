# Codex Prompt 15 — Market Reference Data (買賣參考資訊)

**Goal**: Add bid, ask, bidSize, askSize, dayHigh, dayLow, dayOpen to the Quote type and capture them from Yahoo Finance (US + TW) and Finnhub (US only). Display them in the portfolio page as a compact reference row under each stock's price. These are for **reference only** — not used in buy/sell decisions.

**Apply after**: Prompts 01–14 applied.

---

## Step 1: Update `src/lib/market-data/types.ts`

Add 7 new optional fields to the `Quote` interface:

```typescript
export interface Quote {
  symbol: string;
  market: "US" | "TW";
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  // ── Market reference data (for display only) ──────────────────
  bid?: number;        // 買一價
  ask?: number;        // 賣一價
  bidSize?: number;    // 買一量（手數）
  askSize?: number;    // 賣一量（手數）
  dayHigh?: number;    // 今日最高
  dayLow?: number;     // 今日最低
  dayOpen?: number;    // 今日開盤
  // ──────────────────────────────────────────────────────────────
  source: string;
  qualityState: DataQualityState;
  sourceUpdatedAt: string;
}
```

No other changes to this file.

---

## Step 2: Update `src/lib/market-data/yahoo.ts`

### 2a. Update the `getQuote` method (the one using `YAHOO_QUOTE_URL` v7)

Find the section that builds and returns the `Quote` object (around the `return { symbol, market, price, ... }` block). The Yahoo Finance v7 API response already includes these fields — just capture them.

**Update the type annotation for `data` response:**

```typescript
const data = (await response.json()) as {
  quoteResponse?: {
    result?: Array<Record<string, unknown>>;
  };
};
```

This is already using `Record<string, unknown>` so `toNumber()` can extract any field.

**Update the return object to include new fields:**

```typescript
return {
  symbol,
  market,
  price,
  change: toNumber(quote.regularMarketChange),
  changePct: toNumber(quote.regularMarketChangePercent),
  volume: toNumber(quote.regularMarketVolume) || undefined,
  // Market reference data from Yahoo Finance
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
```

**Important notes:**
- Yahoo Finance v7 `/quote` endpoint returns `bid`, `ask`, `bidSize`, `askSize` for US stocks during market hours. Outside hours these may be 0 — use `|| undefined` to avoid storing 0.
- Taiwan stocks (`.TW`) return `regularMarketDayHigh`, `regularMarketDayLow`, `regularMarketOpen` but typically NOT bid/ask. The `|| undefined` handles this gracefully.
- `toNumber()` already returns 0 for missing/null values, so `toNumber(x) || undefined` converts 0 → undefined cleanly.

### 2b. Update `getQuoteFromChart` method (the one using `YAHOO_CHART_URL` v8)

This method uses a different endpoint (chart API) that does NOT return bid/ask. Leave bid/ask/bidSize/askSize as undefined. But it does return OHLC in the chart data — however, extracting dayHigh/dayLow from the chart endpoint is complex. 

**For this method**: just add `undefined` for all new fields — the v7 `getQuote` method is the one that provides bid/ask/dayOHLC:

```typescript
return {
  symbol,
  market,
  price,
  change,
  changePct,
  volume,
  // Chart endpoint doesn't provide bid/ask — leave undefined
  source,
  qualityState: ...,
  sourceUpdatedAt
};
```

(No change needed here — existing return already omits these fields, TypeScript will treat them as undefined since they're optional.)

---

## Step 3: Update `src/lib/market-data/finnhub.ts`

Finnhub `/quote` already returns `h` (dayHigh), `l` (dayLow), `o` (dayOpen) in its response. It does NOT return bid/ask (that requires a paid plan). Just capture the three OHLC fields.

**Update the type annotation for the Finnhub `/quote` response:**

```typescript
const data = (await response.json()) as {
  c?: number;   // current price
  d?: number;   // change
  dp?: number;  // change percent
  pc?: number;  // previous close
  h?: number;   // day high
  l?: number;   // day low
  o?: number;   // day open
  t?: number;   // timestamp
};
```

**Update the return object:**

```typescript
return {
  symbol,
  market: "US",
  price,
  change: toNumber(data.d),
  changePct: toNumber(data.dp),
  // Finnhub provides day OHLC but NOT bid/ask
  dayHigh: toNumber(data.h) || undefined,
  dayLow: toNumber(data.l) || undefined,
  dayOpen: toNumber(data.o) || undefined,
  source: "Finnhub",
  qualityState: usQuoteQuality(sourceUpdatedAt),
  sourceUpdatedAt
};
```

---

## Step 4: Update `src/app/portfolio/page.tsx`

Add a compact reference data sub-row under the price cell. No new table columns — the table is already wide. Instead, show the reference data inline below the current price as small grey text.

### 4a. Add a helper function at the top of the file (before the component):

```typescript
function formatMarketRef(quote: Quote): string | null {
  const parts: string[] = [];

  if (quote.dayHigh && quote.dayLow) {
    parts.push(`H ${formatNumber(quote.dayHigh, 2)} / L ${formatNumber(quote.dayLow, 2)}`);
  }

  if (quote.bid && quote.ask) {
    parts.push(`買 ${formatNumber(quote.bid, 2)} / 賣 ${formatNumber(quote.ask, 2)}`);
  }

  return parts.length > 0 ? parts.join("  ·  ") : null;
}
```

### 4b. Update the price cell in the table (find the `<Td>` that renders `quote.price`):

**Before:**
```tsx
<Td>
  <div className="flex flex-col gap-1">
    <span>{hasPrice ? formatNumber(quote.price, 2) : "—"}</span>
    <QualityBadge state={quote?.qualityState ?? "missing"} />
  </div>
</Td>
```

**After:**
```tsx
<Td>
  <div className="flex flex-col gap-1">
    <span>{hasPrice ? formatNumber(quote.price, 2) : "—"}</span>
    {hasPrice && formatMarketRef(quote) && (
      <span className="text-xs text-slate-400">{formatMarketRef(quote)}</span>
    )}
    <QualityBadge state={quote?.qualityState ?? "missing"} />
  </div>
</Td>
```

This shows something like:
```
157.70
H 159.20 / L 156.40  ·  買 157.65 / 賣 157.75
[delayed]
```

For Taiwan stocks that have dayHigh/dayLow but no bid/ask, it shows only the H/L line.

---

## Step 5: TypeScript check

Run `npx tsc --noEmit` — there should be no new errors since all new fields are optional.

If you see errors like "Object literal may only specify known properties", check that the `toNumber` utility handles unknown record values — it already does since `quote` is typed as `Record<string, unknown>`.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/market-data/types.ts` | Add `bid?`, `ask?`, `bidSize?`, `askSize?`, `dayHigh?`, `dayLow?`, `dayOpen?` to `Quote` |
| `src/lib/market-data/yahoo.ts` | Capture `bid`, `ask`, `bidSize`, `askSize`, `regularMarketDayHigh`, `regularMarketDayLow`, `regularMarketOpen` in `getQuote()` |
| `src/lib/market-data/finnhub.ts` | Capture `h` (dayHigh), `l` (dayLow), `o` (dayOpen) from `/quote` response |
| `src/app/portfolio/page.tsx` | Add `formatMarketRef()` helper + display H/L and bid/ask as sub-text under price |

**Data availability summary:**
| 欄位 | US (Yahoo) | TW (Yahoo) | US (Finnhub) |
|------|-----------|-----------|-------------|
| 今日最高/最低 | ✓ | ✓ | ✓ |
| 今日開盤 | ✓ | ✓ | ✓ |
| 買一/賣一價 | ✓（盤中）| ✗ | ✗（需付費）|
| 買一/賣一量 | ✓（盤中）| ✗ | ✗ |
