# Codex Prompt 17 — K 線圖 (Candlestick + Volume Chart)

**Goal**: 在股票詳情頁（`/portfolio/[id]`）加入 K 線圖。上方顯示 30 日 OHLCV 蠟燭圖，下方顯示成交量柱狀圖。使用已安裝的 `lightweight-charts` v5（TradingView 出品）。

**Apply after**: Prompts 01–16 applied.

---

## Step 1: Create `src/components/stock-chart.tsx`

This is a **client component**. It receives OHLCV data as props from the server-side detail page and renders the chart into a DOM element via `useEffect`.

```typescript
"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";

export interface OHLCVPoint {
  date: string;   // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockChartProps {
  data: OHLCVPoint[];
  market: "US" | "TW";
}

export function StockChart({ data, market }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    // ── Build chart ─────────────────────────────────────────────────────────
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#ffffff" },
        textColor: "#64748b",          // slate-500
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#f1f5f9" },  // slate-100
        horzLines: { color: "#f1f5f9" },
      },
      crosshair: {
        mode: 1,  // MagnetCrosshairMode
      },
      rightPriceScale: {
        borderColor: "#e2e8f0",        // slate-200
      },
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    // ── Candlestick series (pane 0) ──────────────────────────────────────────
    //
    // Color convention:
    //  Taiwan (TW): red = up, green = down (台灣慣例)
    //  US:          green = up, red = down
    //
    const upColor   = market === "TW" ? "#ef4444" : "#22c55e";  // red / green
    const downColor = market === "TW" ? "#22c55e" : "#ef4444";  // green / red

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    }, 0);

    const candleData: CandlestickData<Time>[] = data.map((d) => ({
      time: d.date as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candleSeries.setData(candleData);

    // ── Volume histogram series (pane 1) ─────────────────────────────────────
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    }, 1);

    // Configure pane 1 height ratio: volume pane is ~25% of total
    chart.panes()[1]?.setHeight(100);

    const volumeData: HistogramData<Time>[] = data.map((d) => ({
      time: d.date as Time,
      value: d.volume,
      // Color volume bar same as candle direction
      color: d.close >= d.open
        ? (market === "TW" ? "#ef444480" : "#22c55e80")
        : (market === "TW" ? "#22c55e80" : "#ef444480"),
    }));

    volumeSeries.setData(volumeData);

    // ── Fit all data in view ─────────────────────────────────────────────────
    chart.timeScale().fitContent();

    // ── Responsive resize ────────────────────────────────────────────────────
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({ width: entry.contentRect.width });
      }
    });

    observer.observe(containerRef.current);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, market]);

  if (!data.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md bg-slate-50 text-sm text-slate-400">
        無歷史資料
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}
```

---

## Step 2: Update `src/app/portfolio/[id]/page.tsx`

### 2a. Import the chart component

Add to the imports at the top of the file:

```typescript
import { StockChart } from "@/components/stock-chart";
```

### 2b. Replace the OHLCV table section with chart + optional table

Find the section that renders the OHLCV table (the block with heading "近期走勢（30 日）"). Replace the entire block with:

```tsx
{history.length > 0 && (
  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 text-lg font-semibold text-slate-950">近期走勢（30 日）</h2>

    {/* K 線圖 */}
    <StockChart
      data={history}
      market={security.market as "US" | "TW"}
    />

    {/* OHLCV detail table below the chart (collapsed by default, last 10 days) */}
    <details className="mt-4">
      <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
        顯示數字明細
      </summary>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>日期</Th>
              <Th>開盤</Th>
              <Th>最高</Th>
              <Th>最低</Th>
              <Th>收盤</Th>
              <Th>成交量</Th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().slice(0, 10).map((candle) => (
              <tr key={candle.date}>
                <Td>{candle.date}</Td>
                <Td>{formatNumber(candle.open, 2)}</Td>
                <Td>{formatNumber(candle.high, 2)}</Td>
                <Td>{formatNumber(candle.low, 2)}</Td>
                <Td
                  className={
                    candle.close >= candle.open ? "text-green-700" : "text-red-700"
                  }
                >
                  {formatNumber(candle.close, 2)}
                </Td>
                <Td>
                  {candle.volume ? formatNumber(candle.volume / 1000, 0) + "K" : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </details>
  </div>
)}
```

The table is now hidden under a `<details>` element so the chart is the main visual. User can expand if they want the raw numbers.

---

## Step 3: TypeScript check

```bash
npx tsc --noEmit
```

Potential issues:
- `chart.panes()[1]?.setHeight(100)` — `panes()` returns `IPaneApi[]` in v5. If TypeScript can't find `setHeight`, check the typings file: `node_modules/lightweight-charts/dist/typings.d.ts` and search for `setHeight`. If the method doesn't exist on the type, cast: `(chart.panes()[1] as { setHeight?: (h: number) => void })?.setHeight?.(100)`.
- `CandlestickSeries` and `HistogramSeries` are named exports from `"lightweight-charts"` in v5. If you get "Module has no exported member", verify with: `import * as LC from 'lightweight-charts'; console.log(Object.keys(LC))` in a test file.
- `Time` type: imported from `"lightweight-charts"`. If `d.date as Time` causes an error, use `d.date as unknown as Time`.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/components/stock-chart.tsx` | **NEW** — client component wrapping lightweight-charts v5 |
| `src/app/portfolio/[id]/page.tsx` | Replace OHLCV table with `<StockChart>` + collapsible detail table |

**Result**: Stock detail page now shows a professional candlestick chart with:
- 上方：30 日 K 線（紅漲綠跌 for TW，綠漲紅跌 for US）
- 下方：成交量柱狀圖（顏色與 K 棒一致）
- 自動 responsive（視窗縮放時圖表寬度自動調整）
- 可展開數字明細表格
