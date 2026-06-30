"use client";

import { useEffect, useRef, useState } from "react";
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

export interface OHLCVPoint {
  date: string;
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

function computeSMA(data: OHLCVPoint[], period: number): LineData<Time>[] {
  const result: LineData<Time>[] = [];

  for (let i = period - 1; i < data.length; i += 1) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, day) => sum + day.close, 0) / period;
    result.push({
      time: data[i].date as Time,
      value: Math.round(avg * 100) / 100
    });
  }

  return result;
}

function computeBollingerBands(
  data: OHLCVPoint[],
  period = 20
): { upper: LineData<Time>[]; lower: LineData<Time>[] } {
  const upper: LineData<Time>[] = [];
  const lower: LineData<Time>[] = [];

  for (let i = period - 1; i < data.length; i += 1) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, day) => sum + day.close, 0) / period;
    const variance =
      slice.reduce((sum, day) => sum + Math.pow(day.close - avg, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper.push({
      time: data[i].date as Time,
      value: Math.round((avg + 2 * stdDev) * 100) / 100
    });
    lower.push({
      time: data[i].date as Time,
      value: Math.round((avg - 2 * stdDev) * 100) / 100
    });
  }

  return { upper, lower };
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

  useEffect(() => {
    if (!containerRef.current || !data.length) return;
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#ffffff" },
        textColor: "#64748b",
        fontSize: 12
      },
      grid: {
        vertLines: { color: "#f1f5f9" },
        horzLines: { color: "#f1f5f9" }
      },
      crosshair: {
        mode: 1
      },
      rightPriceScale: {
        borderColor: "#e2e8f0"
      },
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: false
      },
      width: containerRef.current.clientWidth,
      height: 400
    });

    chartRef.current = chart;

    const upColor = market === "TW" ? "#ef4444" : "#22c55e";
    const downColor = market === "TW" ? "#22c55e" : "#ef4444";

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor
      },
      0
    );

    const candleData: CandlestickData<Time>[] = sorted.map((point) => ({
      time: point.date as Time,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close
    }));

    candleSeries.setData(candleData);

    if (visibleLines.sma20) {
      const sma20Data = computeSMA(sorted, 20);
      if (sma20Data.length) {
        const sma20Series = chart.addSeries(
          LineSeries,
          {
            color: "#f97316",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: true,
            title: "月"
          },
          0
        );
        sma20Series.setData(sma20Data);
      }
    }

    if (visibleLines.sma60) {
      const sma60Data = computeSMA(sorted, 60);
      if (sma60Data.length) {
        const sma60Series = chart.addSeries(
          LineSeries,
          {
            color: "#a855f7",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: true,
            title: "季"
          },
          0
        );
        sma60Series.setData(sma60Data);
      }
    }

    if (visibleLines.sma200) {
      const sma200Data = computeSMA(sorted, 200);
      if (sma200Data.length) {
        const sma200Series = chart.addSeries(
          LineSeries,
          {
            color: "#3b82f6",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: true,
            title: "年"
          },
          0
        );
        sma200Series.setData(sma200Data);
      }
    }

    if (visibleLines.bollinger) {
      const bands = computeBollingerBands(sorted, 20);
      if (bands.upper.length) {
        const upperSeries = chart.addSeries(
          LineSeries,
          {
            color: "#94a3b8",
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            title: "布林上"
          },
          0
        );
        const lowerSeries = chart.addSeries(
          LineSeries,
          {
            color: "#94a3b8",
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            title: "布林下"
          },
          0
        );
        upperSeries.setData(bands.upper);
        lowerSeries.setData(bands.lower);
      }
    }

    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: "volume" },
        priceScaleId: "volume"
      },
      1
    );

    const volumePane = chart.panes()[1] as { setHeight?: (height: number) => void } | undefined;
    volumePane?.setHeight?.(100);

    const volumeData: HistogramData<Time>[] = sorted.map((point) => ({
      time: point.date as Time,
      value: point.volume,
      color:
        point.close >= point.open
          ? market === "TW"
            ? "#ef444480"
            : "#22c55e80"
          : market === "TW"
            ? "#22c55e80"
            : "#ef444480"
    }));

    volumeSeries.setData(volumeData);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({ width: entry.contentRect.width });
      }
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, market, visibleLines]);

  if (!data.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md bg-slate-50 text-sm text-slate-400">
        無歷史資料
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => toggleLine("sma20")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.sma20 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          月線 MA20
        </button>
        <button
          type="button"
          onClick={() => toggleLine("sma60")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.sma60 ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          季線 MA60
        </button>
        <button
          type="button"
          onClick={() => toggleLine("sma200")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.sma200 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          年線 MA200
        </button>
        <button
          type="button"
          onClick={() => toggleLine("bollinger")}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            visibleLines.bollinger ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          布林通道
        </button>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
