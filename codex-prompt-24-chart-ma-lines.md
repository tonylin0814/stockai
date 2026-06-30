# Codex Prompt 24 — Chart MA Lines + Fix History to 252 Days + Technical Pattern Detection

**Goal**: Three related improvements:
1. Increase history fetch from 90 → 252 days so SMA200 (年線) can actually be computed
2. Add moving average lines to the K-line chart: 月線 (SMA20), 季線 (SMA60), 年線 (SMA200), plus Bollinger Band support/resistance
3. Add candlestick pattern recognition, support/resistance levels, and volume signals to `TechnicalSummary` so the AI can read patterns — not just numbers

**Apply after**: Prompts 01–23 applied.

---

## Part A: Increase history to 252 days

### File: `src/lib/analysis/data-package.ts`

Find both occurrences of `getHistory(..., 90)` (one for holdings, one for watchlist):

```typescript
provider.getHistory(security.symbol, security.market, 90)
```

Replace both with:

```typescript
provider.getHistory(security.symbol, security.market, 252)
```

That's it — `computeTechnicals` already handles 200+ data points correctly. This gives:
- SMA200 (年線) — now computable for most US stocks
- True 52W high/low (uses `closes.slice(-252)`)
- More accurate MACD and Bollinger bands

---

## Part B: Add MA lines to StockChart component

### File: `src/components/stock-chart.tsx`

#### 1. Add `LineSeries` to imports

```typescript
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type IChartApi,
  type Time
} from "lightweight-charts";
```

#### 2. Add MA computation helper (above the component)

```typescript
function computeSMA(data: OHLCVPoint[], period: number): LineData<Time>[] {
  const result: LineData<Time>[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, d) => sum + d.close, 0) / period;
    result.push({
      time: data[i].date as Time,
      value: Math.round(avg * 100) / 100
    });
  }
  return result;
}

function computeBollingerBands(data: OHLCVPoint[], period = 20): {
  upper: LineData<Time>[];
  lower: LineData<Time>[];
} {
  const upper: LineData<Time>[] = [];
  const lower: LineData<Time>[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, d) => sum + d.close, 0) / period;
    const variance = slice.reduce((sum, d) => sum + Math.pow(d.close - avg, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper.push({ time: data[i].date as Time, value: Math.round((avg + 2 * stdDev) * 100) / 100 });
    lower.push({ time: data[i].date as Time, value: Math.round((avg - 2 * stdDev) * 100) / 100 });
  }
  return { upper, lower };
}
```

#### 3. Add legend state and toggle UI

Add props for controlling which lines are visible. Use `useState` inside the component to track toggles:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
// ... other imports ...

interface StockChartProps {
  data: OHLCVPoint[];
  market: "US" | "TW";
}

export function StockChart({ data, market }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [visibleLines, setVisibleLines] = useState({
    sma20: true,
    sma60: true,
    sma200: true,
    bollinger: false
  });

  function toggleLine(key: keyof typeof visibleLines) {
    setVisibleLines((prev) => ({ ...prev, [key]: !prev[key] }));
  }
```

#### 4. Add MA series inside `useEffect` after the candleSeries

After `candleSeries.setData(candleData);`, add:

```typescript
    // 月線 SMA20 — orange
    if (visibleLines.sma20) {
      const sma20Data = computeSMA(sorted, 20);
      if (sma20Data.length) {
        const sma20Series = chart.addSeries(LineSeries, {
          color: "#f97316",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "月"
        }, 0);
        sma20Series.setData(sma20Data);
      }
    }

    // 季線 SMA60 — purple
    if (visibleLines.sma60) {
      const sma60Data = computeSMA(sorted, 60);
      if (sma60Data.length) {
        const sma60Series = chart.addSeries(LineSeries, {
          color: "#a855f7",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "季"
        }, 0);
        sma60Series.setData(sma60Data);
      }
    }

    // 年線 SMA200 — blue
    if (visibleLines.sma200) {
      const sma200Data = computeSMA(sorted, 200);
      if (sma200Data.length) {
        const sma200Series = chart.addSeries(LineSeries, {
          color: "#3b82f6",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "年"
        }, 0);
        sma200Series.setData(sma200Data);
      }
    }

    // Bollinger Bands — dashed grey (support/resistance)
    if (visibleLines.bollinger) {
      const bands = computeBollingerBands(sorted, 20);
      if (bands.upper.length) {
        const upperSeries = chart.addSeries(LineSeries, {
          color: "#94a3b8",
          lineWidth: 1,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: false,
          title: "布林上"
        }, 0);
        upperSeries.setData(bands.upper);

        const lowerSeries = chart.addSeries(LineSeries, {
          color: "#94a3b8",
          lineWidth: 1,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: false,
          title: "布林下"
        }, 0);
        lowerSeries.setData(bands.lower);
      }
    }
```

**Important**: Sort the data before computing MAs. Add this near the top of `useEffect`:
```typescript
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
```
And use `sorted` instead of `data` for all `candleData`, `volumeData`, and MA computations.

#### 5. Add toggle buttons above the chart

Return:
```tsx
  return (
    <div>
      {/* MA toggle buttons */}
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => toggleLine("sma20")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.sma20
              ? "bg-orange-100 text-orange-700"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          月線 MA20
        </button>
        <button
          onClick={() => toggleLine("sma60")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.sma60
              ? "bg-purple-100 text-purple-700"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          季線 MA60
        </button>
        <button
          onClick={() => toggleLine("sma200")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.sma200
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          年線 MA200
        </button>
        <button
          onClick={() => toggleLine("bollinger")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.bollinger
              ? "bg-slate-200 text-slate-700"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          布林通道
        </button>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
```

#### 6. Add `visibleLines` to useEffect dependency array

```typescript
  }, [data, market, visibleLines]);
```

---

---

## Part C: Candlestick pattern detection + support/resistance + volume signals

### C1. Extend `TechnicalSummary` type in `src/lib/market-data/indicators.ts`

Add these fields to the `TechnicalSummary` type:

```typescript
export type TechnicalSummary = {
  // ... existing fields ...

  // Candlestick patterns (last 3 candles)
  candlePattern: 
    | "hammer"           // 錘子線 — bullish reversal at bottom
    | "shooting_star"    // 流星線 — bearish reversal at top
    | "doji"             // 十字星 — indecision
    | "bullish_engulfing" // 多頭吞噬
    | "bearish_engulfing" // 空頭吞噬
    | "morning_star"     // 早晨之星 — bullish reversal (3-candle)
    | "evening_star"     // 黃昏之星 — bearish reversal (3-candle)
    | null;

  // Support / resistance (derived from recent swing points)
  nearestSupport: number | null;    // closest swing low below current price
  nearestResistance: number | null; // closest swing high above current price
  supportStrength: "strong" | "weak" | null; // tested multiple times = strong
  resistanceStrength: "strong" | "weak" | null;

  // Volume signal
  volumeSignal:
    | "breakout_volume"  // today's volume > 2x 20-day avg AND price up
    | "selloff_volume"   // today's volume > 2x 20-day avg AND price down
    | "drying_up"        // volume < 0.5x 20-day avg (consolidation)
    | "normal"
    | null;
};
```

### C2. Add detection functions in `src/lib/market-data/indicators.ts`

Add these functions before `computeTechnicals`:

```typescript
function detectCandlePattern(history: OHLCV[]): TechnicalSummary["candlePattern"] {
  if (history.length < 3) return null;
  const [prev2, prev1, cur] = history.slice(-3);
  const body = (c: OHLCV) => Math.abs(c.close - c.open);
  const range = (c: OHLCV) => c.high - c.low;
  const isBull = (c: OHLCV) => c.close > c.open;
  const isBear = (c: OHLCV) => c.close < c.open;

  // Doji — body < 10% of range
  if (range(cur) > 0 && body(cur) / range(cur) < 0.1) return "doji";

  // Hammer — small body at top, long lower wick (at least 2x body), bullish context
  const lowerWick = (c: OHLCV) => Math.min(c.open, c.close) - c.low;
  const upperWick = (c: OHLCV) => c.high - Math.max(c.open, c.close);
  if (
    body(cur) > 0 &&
    lowerWick(cur) >= 2 * body(cur) &&
    upperWick(cur) <= body(cur) * 0.5
  ) return "hammer";

  // Shooting star — small body at bottom, long upper wick
  if (
    body(cur) > 0 &&
    upperWick(cur) >= 2 * body(cur) &&
    lowerWick(cur) <= body(cur) * 0.5
  ) return "shooting_star";

  // Bullish engulfing — prev bearish, cur bullish and fully covers prev body
  if (
    isBear(prev1) &&
    isBull(cur) &&
    cur.open < prev1.close &&
    cur.close > prev1.open
  ) return "bullish_engulfing";

  // Bearish engulfing — prev bullish, cur bearish and fully covers prev body
  if (
    isBull(prev1) &&
    isBear(cur) &&
    cur.open > prev1.close &&
    cur.close < prev1.open
  ) return "bearish_engulfing";

  // Morning star — bear, small body, bull (3-candle)
  if (
    isBear(prev2) &&
    body(prev1) < body(prev2) * 0.3 &&
    isBull(cur) &&
    cur.close > (prev2.open + prev2.close) / 2
  ) return "morning_star";

  // Evening star — bull, small body, bear (3-candle)
  if (
    isBull(prev2) &&
    body(prev1) < body(prev2) * 0.3 &&
    isBear(cur) &&
    cur.close < (prev2.open + prev2.close) / 2
  ) return "evening_star";

  return null;
}

function detectSupportResistance(history: OHLCV[], currentPrice: number): {
  nearestSupport: number | null;
  nearestResistance: number | null;
  supportStrength: "strong" | "weak" | null;
  resistanceStrength: "strong" | "weak" | null;
} {
  if (history.length < 20) {
    return { nearestSupport: null, nearestResistance: null, supportStrength: null, resistanceStrength: null };
  }

  // Find swing highs and lows over last 60 candles
  const window = history.slice(-60);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < window.length - 2; i++) {
    const h = window[i].high;
    if (
      h > window[i - 1].high && h > window[i - 2].high &&
      h > window[i + 1].high && h > window[i + 2].high
    ) swingHighs.push(h);

    const l = window[i].low;
    if (
      l < window[i - 1].low && l < window[i - 2].low &&
      l < window[i + 1].low && l < window[i + 2].low
    ) swingLows.push(l);
  }

  // Nearest support = highest swing low below current price
  const supports = swingLows.filter((l) => l < currentPrice).sort((a, b) => b - a);
  const nearestSupport = supports[0] ?? null;

  // Nearest resistance = lowest swing high above current price
  const resistances = swingHighs.filter((h) => h > currentPrice).sort((a, b) => a - b);
  const nearestResistance = resistances[0] ?? null;

  // Strength = tested 2+ times within 3% zone
  const tolerance = 0.03;
  const supportStrength = nearestSupport !== null && supports.filter(
    (s) => Math.abs(s - nearestSupport) / nearestSupport < tolerance
  ).length >= 2 ? "strong" : nearestSupport !== null ? "weak" : null;

  const resistanceStrength = nearestResistance !== null && resistances.filter(
    (r) => Math.abs(r - nearestResistance) / nearestResistance < tolerance
  ).length >= 2 ? "strong" : nearestResistance !== null ? "weak" : null;

  return { nearestSupport, nearestResistance, supportStrength, resistanceStrength };
}

function detectVolumeSignal(
  history: OHLCV[],
  avgVolume20d: number | null
): TechnicalSummary["volumeSignal"] {
  if (!avgVolume20d || history.length === 0) return null;
  const last = history[history.length - 1];
  const ratio = last.volume / avgVolume20d;
  if (ratio > 2) return last.close >= last.open ? "breakout_volume" : "selloff_volume";
  if (ratio < 0.5) return "drying_up";
  return "normal";
}
```

### C3. Call the new functions inside `computeTechnicals`

At the end of `computeTechnicals`, before the `return` statement, add:

```typescript
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  // (sorted is already used for closes/volumes above — reuse it)

  const candlePattern = detectCandlePattern(sorted);
  const { nearestSupport, nearestResistance, supportStrength, resistanceStrength } =
    detectSupportResistance(sorted, current);
  const volumeSignal = detectVolumeSignal(sorted, avgVolume20d);
```

And add these to the return object:

```typescript
  return {
    // ... existing fields ...
    candlePattern,
    nearestSupport: nearestSupport ? rounded(nearestSupport) : null,
    nearestResistance: nearestResistance ? rounded(nearestResistance) : null,
    supportStrength,
    resistanceStrength,
    volumeSignal,
    dataPoints: n
  };
```

Also add all these fields to the `n === 0` early-return object with `null` values.

### C4. Format new fields in `compactMarketSummary` — `src/lib/analysis/prompts/common.ts`

Find the `formatTechnicals` function and add new fields:

```typescript
  function formatTechnicals(technicals: TechnicalSummary): string {
    // ... existing lines ...
    if (technicals.candlePattern) parts.push(`K線形態=${technicals.candlePattern}`);
    if (technicals.nearestSupport !== null) {
      parts.push(`支撐=${technicals.nearestSupport}${technicals.supportStrength === "strong" ? "(強)" : "(弱)"}`);
    }
    if (technicals.nearestResistance !== null) {
      parts.push(`壓力=${technicals.nearestResistance}${technicals.resistanceStrength === "strong" ? "(強)" : "(弱)"}`);
    }
    if (technicals.volumeSignal && technicals.volumeSignal !== "normal") {
      parts.push(`量能=${technicals.volumeSignal}`);
    }
    // ... rest of existing code ...
  }
```

### C5. Update `TECHNICAL_ANALYSIS_GUIDE` in `common.ts` to reference new fields

Find `TECHNICAL_ANALYSIS_GUIDE` and append:

```typescript
export const TECHNICAL_ANALYSIS_GUIDE = `...existing content...

**K線形態判讀：**
- hammer / morning_star → 底部反轉訊號，需配合成交量確認
- shooting_star / evening_star → 頂部反轉訊號，注意壓力
- bullish_engulfing / bearish_engulfing → 強力反轉，當日收盤方向優先
- doji → 多空拉鋸，等待方向確認後再行動

**支撐壓力判讀：**
- 支撐(強) → 曾多次測試守穩，可作為停損參考點
- 壓力(強) → 曾多次突破失敗，突破需放量確認
- 現價距支撐/壓力的百分比自行計算，判斷風險報酬比

**量能訊號：**
- breakout_volume → 放量上漲，突破訊號可信度高
- selloff_volume → 放量下跌，賣壓沉重，避免逢低承接
- drying_up → 縮量整理，通常為蓄勢，等待方向選擇`;
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/data-package.ts` | `getHistory(..., 90)` → `getHistory(..., 252)` (both occurrences) |
| `src/components/stock-chart.tsx` | Add `computeSMA`, `computeBollingerBands` helpers; add toggleable MA line series (月線/季線/年線/布林); toggle buttons UI |
| `src/lib/market-data/indicators.ts` | Add `candlePattern`, `nearestSupport`, `nearestResistance`, `supportStrength`, `resistanceStrength`, `volumeSignal` to `TechnicalSummary`; add `detectCandlePattern`, `detectSupportResistance`, `detectVolumeSignal` functions |
| `src/lib/analysis/prompts/common.ts` | Format new fields in `formatTechnicals`; extend `TECHNICAL_ANALYSIS_GUIDE` with pattern interpretation |

## Color convention

| Line | Color | Label |
|------|-------|-------|
| SMA20 | Orange `#f97316` | 月線 |
| SMA60 | Purple `#a855f7` | 季線 |
| SMA200 | Blue `#3b82f6` | 年線 |
| Bollinger Upper | Grey dashed `#94a3b8` | 布林上（壓力） |
| Bollinger Lower | Grey dashed `#94a3b8` | 布林下（支撐） |

## Expected AI output after this prompt

Before: `技術：RSI=62.5 MACD=bullish 布林=near_upper SMA20=152.3 趨勢=uptrend`

After: `技術：RSI=62.5 MACD=bullish_cross 布林=near_upper SMA20=152.3 SMA50=148.7 SMA200=141.2 趨勢=uptrend K線形態=bullish_engulfing 支撐=148.5(強) 壓力=168.0(弱) 量能=breakout_volume`

The AI can now say: "出現多頭吞噬形態，前低支撐 $148.5 曾三度守穩（強支撐），昨日放量突破，技術面偏多。"
