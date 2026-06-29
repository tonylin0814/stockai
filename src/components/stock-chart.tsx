"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
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

export function StockChart({ data, market }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

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

    const candleData: CandlestickData<Time>[] = data.map((point) => ({
      time: point.date as Time,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close
    }));

    candleSeries.setData(candleData);

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

    const volumeData: HistogramData<Time>[] = data.map((point) => ({
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
