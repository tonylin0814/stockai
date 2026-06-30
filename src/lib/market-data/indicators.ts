import type { OHLCV } from "@/lib/market-data/types";

export type TechnicalSummary = {
  currentPrice: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  priceVsSma20Pct: number | null;
  priceVsSma50Pct: number | null;
  trendDirection: "uptrend" | "downtrend" | "sideways" | "insufficient_data";
  high52w: number | null;
  low52w: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  change1w: number | null;
  change1m: number | null;
  change3m: number | null;
  avgVolume20d: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdSignalType: "bullish_cross" | "bearish_cross" | "bullish" | "bearish" | "neutral" | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: "above_upper" | "near_upper" | "middle" | "near_lower" | "below_lower" | null;
  candlePattern:
    | "hammer"
    | "shooting_star"
    | "doji"
    | "bullish_engulfing"
    | "bearish_engulfing"
    | "morning_star"
    | "evening_star"
    | null;
  nearestSupport: number | null;
  nearestResistance: number | null;
  supportStrength: "strong" | "weak" | null;
  resistanceStrength: "strong" | "weak" | null;
  volumeSignal: "breakout_volume" | "selloff_volume" | "drying_up" | "normal" | null;
  dataPoints: number;
};

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  return slice.reduce((sum, close) => sum + close, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const recent = changes.slice(-period);
  const gains = recent.filter((change) => change > 0);
  const losses = recent.filter((change) => change < 0).map(Math.abs);
  const avgGain = gains.length
    ? gains.reduce((sum, gain) => sum + gain, 0) / period
    : 0;
  const avgLoss = losses.length
    ? losses.reduce((sum, loss) => sum + loss, 0) / period
    : 0;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function pctChange(from: number, to: number): number | null {
  if (!from) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function ema(closes: number[], period: number): number[] {
  if (closes.length < period) return [];

  const k = 2 / (period + 1);
  const result: number[] = [];
  const seed = closes.slice(0, period).reduce((sum, close) => sum + close, 0) / period;
  result.push(seed);

  for (let i = period; i < closes.length; i += 1) {
    result.push(closes[i] * k + result[result.length - 1] * (1 - k));
  }

  return result;
}

function computeMACD(closes: number[]): {
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdSignalType: TechnicalSummary["macdSignalType"];
} {
  if (closes.length < 35) {
    return {
      macdLine: null,
      macdSignal: null,
      macdHistogram: null,
      macdSignalType: null
    };
  }

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const offset = ema12.length - ema26.length;
  const macdSeries = ema26.map((value, index) => ema12[index + offset] - value);
  const signalSeries = ema(macdSeries, 9);

  if (macdSeries.length < 2 || signalSeries.length < 2) {
    return {
      macdLine: null,
      macdSignal: null,
      macdHistogram: null,
      macdSignalType: null
    };
  }

  const macdLine = Math.round(macdSeries[macdSeries.length - 1] * 1000) / 1000;
  const macdSignal = Math.round(signalSeries[signalSeries.length - 1] * 1000) / 1000;
  const macdHistogram = Math.round((macdLine - macdSignal) * 1000) / 1000;
  const prevMacd = macdSeries[macdSeries.length - 2];
  const prevSignal = signalSeries[signalSeries.length - 2];

  let macdSignalType: TechnicalSummary["macdSignalType"] = "neutral";
  if (prevMacd < prevSignal && macdLine > macdSignal) {
    macdSignalType = "bullish_cross";
  } else if (prevMacd > prevSignal && macdLine < macdSignal) {
    macdSignalType = "bearish_cross";
  } else if (macdLine > macdSignal) {
    macdSignalType = "bullish";
  } else if (macdLine < macdSignal) {
    macdSignalType = "bearish";
  }

  return { macdLine, macdSignal, macdHistogram, macdSignalType };
}

function computeBollinger(closes: number[], period = 20): {
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: TechnicalSummary["bollingerPosition"];
} {
  if (closes.length < period) {
    return {
      bollingerUpper: null,
      bollingerMiddle: null,
      bollingerLower: null,
      bollingerPosition: null
    };
  }

  const slice = closes.slice(-period);
  const middle = slice.reduce((sum, close) => sum + close, 0) / period;
  const variance =
    slice.reduce((sum, close) => sum + Math.pow(close - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + 2 * stdDev;
  const lower = middle - 2 * stdDev;
  const current = closes[closes.length - 1];

  let bollingerPosition: TechnicalSummary["bollingerPosition"] = "middle";
  if (current > upper) {
    bollingerPosition = "above_upper";
  } else if (current >= upper * 0.98) {
    bollingerPosition = "near_upper";
  } else if (current <= lower) {
    bollingerPosition = "below_lower";
  } else if (current <= lower * 1.02) {
    bollingerPosition = "near_lower";
  }

  return {
    bollingerUpper: rounded(upper),
    bollingerMiddle: rounded(middle),
    bollingerLower: rounded(lower),
    bollingerPosition
  };
}

function detectCandlePattern(history: OHLCV[]): TechnicalSummary["candlePattern"] {
  if (history.length < 3) return null;

  const [prev2, prev1, cur] = history.slice(-3);
  const body = (candle: OHLCV) => Math.abs(candle.close - candle.open);
  const range = (candle: OHLCV) => candle.high - candle.low;
  const isBull = (candle: OHLCV) => candle.close > candle.open;
  const isBear = (candle: OHLCV) => candle.close < candle.open;
  const lowerWick = (candle: OHLCV) => Math.min(candle.open, candle.close) - candle.low;
  const upperWick = (candle: OHLCV) => candle.high - Math.max(candle.open, candle.close);

  if (range(cur) > 0 && body(cur) / range(cur) < 0.1) return "doji";

  if (
    body(cur) > 0 &&
    lowerWick(cur) >= 2 * body(cur) &&
    upperWick(cur) <= body(cur) * 0.5
  ) {
    return "hammer";
  }

  if (
    body(cur) > 0 &&
    upperWick(cur) >= 2 * body(cur) &&
    lowerWick(cur) <= body(cur) * 0.5
  ) {
    return "shooting_star";
  }

  if (isBear(prev1) && isBull(cur) && cur.open < prev1.close && cur.close > prev1.open) {
    return "bullish_engulfing";
  }

  if (isBull(prev1) && isBear(cur) && cur.open > prev1.close && cur.close < prev1.open) {
    return "bearish_engulfing";
  }

  if (
    isBear(prev2) &&
    body(prev1) < body(prev2) * 0.3 &&
    isBull(cur) &&
    cur.close > (prev2.open + prev2.close) / 2
  ) {
    return "morning_star";
  }

  if (
    isBull(prev2) &&
    body(prev1) < body(prev2) * 0.3 &&
    isBear(cur) &&
    cur.close < (prev2.open + prev2.close) / 2
  ) {
    return "evening_star";
  }

  return null;
}

function detectSupportResistance(
  history: OHLCV[],
  currentPrice: number
): Pick<
  TechnicalSummary,
  "nearestSupport" | "nearestResistance" | "supportStrength" | "resistanceStrength"
> {
  if (history.length < 20) {
    return {
      nearestSupport: null,
      nearestResistance: null,
      supportStrength: null,
      resistanceStrength: null
    };
  }

  const window = history.slice(-60);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < window.length - 2; i += 1) {
    const high = window[i].high;
    const low = window[i].low;

    if (
      high > window[i - 1].high &&
      high > window[i - 2].high &&
      high > window[i + 1].high &&
      high > window[i + 2].high
    ) {
      swingHighs.push(high);
    }

    if (
      low < window[i - 1].low &&
      low < window[i - 2].low &&
      low < window[i + 1].low &&
      low < window[i + 2].low
    ) {
      swingLows.push(low);
    }
  }

  const supports = swingLows.filter((low) => low < currentPrice).sort((a, b) => b - a);
  const resistances = swingHighs
    .filter((high) => high > currentPrice)
    .sort((a, b) => a - b);
  const nearestSupport = supports[0] ?? null;
  const nearestResistance = resistances[0] ?? null;
  const tolerance = 0.03;

  return {
    nearestSupport,
    nearestResistance,
    supportStrength:
      nearestSupport !== null
        ? supports.filter((support) => Math.abs(support - nearestSupport) / nearestSupport < tolerance)
            .length >= 2
          ? "strong"
          : "weak"
        : null,
    resistanceStrength:
      nearestResistance !== null
        ? resistances.filter(
            (resistance) =>
              Math.abs(resistance - nearestResistance) / nearestResistance < tolerance
          ).length >= 2
          ? "strong"
          : "weak"
        : null
  };
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

export function computeTechnicals(history: OHLCV[]): TechnicalSummary {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map((day) => day.close).filter((close) => close > 0);
  const volumes = sorted.map((day) => day.volume).filter((volume) => volume > 0);
  const n = closes.length;

  if (n === 0) {
    return {
      currentPrice: 0,
      sma20: null,
      sma50: null,
      sma200: null,
      rsi14: null,
      priceVsSma20Pct: null,
      priceVsSma50Pct: null,
      trendDirection: "insufficient_data",
      high52w: null,
      low52w: null,
      pctFrom52wHigh: null,
      pctFrom52wLow: null,
      change1w: null,
      change1m: null,
      change3m: null,
      avgVolume20d: null,
      macdLine: null,
      macdSignal: null,
      macdHistogram: null,
      macdSignalType: null,
      bollingerUpper: null,
      bollingerMiddle: null,
      bollingerLower: null,
      bollingerPosition: null,
      candlePattern: null,
      nearestSupport: null,
      nearestResistance: null,
      supportStrength: null,
      resistanceStrength: null,
      volumeSignal: null,
      dataPoints: 0
    };
  }

  const current = closes[n - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r14 = rsi(closes, 14);
  const macd = computeMACD(closes);
  const bollinger = computeBollinger(closes);

  let trendDirection: TechnicalSummary["trendDirection"] = "sideways";
  if (s20 && s50) {
    if (current > s20 && s20 > s50) {
      trendDirection = "uptrend";
    } else if (current < s20 && s20 < s50) {
      trendDirection = "downtrend";
    }
  } else if (s20) {
    trendDirection = current > s20 ? "uptrend" : "downtrend";
  } else {
    trendDirection = "insufficient_data";
  }

  const yearCloses = closes.slice(-252);
  const high52w = Math.max(...yearCloses);
  const low52w = Math.min(...yearCloses);
  const recentVolumes = volumes.slice(-20);
  const avgVolume20d = recentVolumes.length
    ? Math.round(recentVolumes.reduce((sum, volume) => sum + volume, 0) / recentVolumes.length)
    : null;
  const candlePattern = detectCandlePattern(sorted);
  const supportResistance = detectSupportResistance(sorted, current);
  const volumeSignal = detectVolumeSignal(sorted, avgVolume20d);

  return {
    currentPrice: current,
    sma20: s20 ? rounded(s20) : null,
    sma50: s50 ? rounded(s50) : null,
    sma200: s200 ? rounded(s200) : null,
    rsi14: r14,
    priceVsSma20Pct: s20 ? pctChange(s20, current) : null,
    priceVsSma50Pct: s50 ? pctChange(s50, current) : null,
    trendDirection,
    high52w: rounded(high52w),
    low52w: rounded(low52w),
    pctFrom52wHigh: pctChange(high52w, current),
    pctFrom52wLow: pctChange(low52w, current),
    change1w: n > 5 ? pctChange(closes[n - 6], current) : null,
    change1m: n > 21 ? pctChange(closes[n - 22], current) : null,
    change3m: n > 63 ? pctChange(closes[n - 64], current) : null,
    avgVolume20d,
    ...macd,
    ...bollinger,
    candlePattern,
    nearestSupport: supportResistance.nearestSupport
      ? rounded(supportResistance.nearestSupport)
      : null,
    nearestResistance: supportResistance.nearestResistance
      ? rounded(supportResistance.nearestResistance)
      : null,
    supportStrength: supportResistance.supportStrength,
    resistanceStrength: supportResistance.resistanceStrength,
    volumeSignal,
    dataPoints: n
  };
}
