# Codex Task: Fix Prompt-Data Mismatch — Agents Saying "資料不足"

## Root Causes

Four concrete bugs causing agents to say "lack of info":

1. **portfolio-review.ts sends data twice** — compactMarketSummary (already includes portfolio with technicals) + raw portfolioJson. Remove the duplicate.
2. **TECHNICAL_ANALYSIS_GUIDE mentions MACD, Bollinger, ADX** — we only compute RSI and SMAs. Agents look for MACD, find nothing, say 資料不足.
3. **FUNDAMENTAL_QUALITY_GUIDE asks for ROIC, Moat, Piotroski** — we only have PE/EPS/marketCap. Taiwan stocks return nothing. Same problem.
4. **NEWS_SENTIMENT_GUIDE requires news** — Taiwan stocks have no news (Finnhub is US-only). Agents see the scoring framework and say 資料不足.

---

## Fix 1: Add MACD and Bollinger Bands to `src/lib/market-data/indicators.ts`

We already have 90 days of OHLCV history. Add these two indicators.

Add the following functions and fields to `indicators.ts`:

### Add to `TechnicalSummary` type (after `avgVolume20d`):

```typescript
  // MACD (12/26/9)
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdSignalType: "bullish_cross" | "bearish_cross" | "bullish" | "bearish" | "neutral" | null;
  // Bollinger Bands (20-period, 2 std dev)
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: "above_upper" | "near_upper" | "middle" | "near_lower" | "below_lower" | null;
```

### Add these helper functions before `computeTechnicals`:

```typescript
function ema(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  // Seed with SMA of first `period` values
  const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(seed);
  for (let i = period; i < closes.length; i++) {
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
    return { macdLine: null, macdSignal: null, macdHistogram: null, macdSignalType: null };
  }
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  // Align: ema26 starts 14 bars later than ema12
  const offset = ema12.length - ema26.length;
  const macdSeries = ema26.map((v, i) => ema12[i + offset] - v);
  const signalSeries = ema(macdSeries, 9);
  const sOffset = macdSeries.length - signalSeries.length;

  const macdLine = Math.round(macdSeries[macdSeries.length - 1] * 1000) / 1000;
  const macdSignal = Math.round(signalSeries[signalSeries.length - 1] * 1000) / 1000;
  const macdHistogram = Math.round((macdLine - macdSignal) * 1000) / 1000;

  const prevMacd = macdSeries[macdSeries.length - 2];
  const prevSignal = signalSeries[signalSeries.length - 2];

  let macdSignalType: TechnicalSummary["macdSignalType"] = "neutral";
  if (prevMacd < prevSignal && macdLine > macdSignal) macdSignalType = "bullish_cross";
  else if (prevMacd > prevSignal && macdLine < macdSignal) macdSignalType = "bearish_cross";
  else if (macdLine > macdSignal) macdSignalType = "bullish";
  else if (macdLine < macdSignal) macdSignalType = "bearish";

  return { macdLine, macdSignal, macdHistogram, macdSignalType };
}

function computeBollinger(closes: number[], period = 20): {
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: TechnicalSummary["bollingerPosition"];
} {
  if (closes.length < period) {
    return { bollingerUpper: null, bollingerMiddle: null, bollingerLower: null, bollingerPosition: null };
  }
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + 2 * stdDev;
  const lower = middle - 2 * stdDev;
  const current = closes[closes.length - 1];

  let bollingerPosition: TechnicalSummary["bollingerPosition"] = "middle";
  if (current > upper) bollingerPosition = "above_upper";
  else if (current >= upper * 0.98) bollingerPosition = "near_upper";
  else if (current <= lower) bollingerPosition = "below_lower";
  else if (current <= lower * 1.02) bollingerPosition = "near_lower";

  return {
    bollingerUpper: Math.round(upper * 100) / 100,
    bollingerMiddle: Math.round(middle * 100) / 100,
    bollingerLower: Math.round(lower * 100) / 100,
    bollingerPosition,
  };
}
```

### In `computeTechnicals`, add calls to both functions and include their results in the return value:

After computing `r14`, add:
```typescript
  const macd = computeMACD(closes);
  const bollinger = computeBollinger(closes);
```

In the `n === 0` early return, add null values for all new fields:
```typescript
  macdLine: null, macdSignal: null, macdHistogram: null, macdSignalType: null,
  bollingerUpper: null, bollingerMiddle: null, bollingerLower: null, bollingerPosition: null,
```

In the main return, add:
```typescript
    ...macd,
    ...bollinger,
```

---

## Fix 2: Update `src/lib/analysis/prompts/common.ts`

### 2a. Update TECHNICAL_ANALYSIS_GUIDE to only reference computed indicators

Replace the `TECHNICAL_ANALYSIS_GUIDE` constant with:

```typescript
export const TECHNICAL_ANALYSIS_GUIDE = `技術面分析（使用資料摘要中已計算的指標）：
- RSI(14)：數值已提供。>70 超買（注意回落風險）、<30 超賣（可能反彈）、50=多空分界
- MACD：信號類型已提供（bullish_cross=金叉買入信號、bearish_cross=死叉賣出信號、bullish=多頭排列、bearish=空頭排列）
- 布林通道：位置已提供（above_upper=突破上軌強勢但超買、near_upper=接近壓力、middle=中性、near_lower=接近支撐、below_lower=跌破下軌弱勢）
- 均線排列：SMA20/SMA50/SMA200 數值已提供。價格>SMA200=長線多頭；SMA20>SMA50=短線多頭
- 趨勢方向：uptrend/downtrend/sideways 已計算
- 近期表現：1W/1M/3M 漲跌幅已提供
- 52週位置：距52週高點百分比已提供（-5%以內=接近高點、-20%以下=明顯回撤）
所有以上數值均在資料摘要「技術：」欄位中，直接使用，不得猜測或假設。`;
```

### 2b. Update FUNDAMENTAL_QUALITY_GUIDE to distinguish data vs qualitative

Replace `FUNDAMENTAL_QUALITY_GUIDE` with:

```typescript
export const FUNDAMENTAL_QUALITY_GUIDE = `基本面評估（分兩層）：

**層 1：使用資料包中的量化數據（有才填，無則跳過）**
- PE 本益比：資料中有提供時，判斷是偏高/合理/偏低（科技股合理範圍 15-35x；防禦股 10-20x）
- EPS：正負判斷盈虧；趨勢方向
- 毛利率：>40% 為高品質，<20% 需注意
- 市值：大型股 >100B、中型股 10-100B、小型股 <10B
若資料包中「基本面：基本面資料不足」，層 1 直接跳過，不寫「資料不足」，直接進層 2。

**層 2：使用 AI 訓練知識做定性評估（永遠執行，不依賴資料包）**
以下內容請根據你對此公司/ETF 的訓練知識作答：
- 業務模式：主要收入來源、商業模式穩定性
- 競爭地位：在同業中的排名（龍頭/挑戰者/利基）
- 護城河：是否有品牌、專利、網路效應或成本優勢？（強/中/弱）
- 近年表現：最近 2-3 年獲利趨勢（成長/持平/衰退）
- 主要風險因素：已知的結構性風險（非市場波動）
注意：層 2 是定性分析，不需要數字，明確說明這是基於 AI 訓練知識而非即時資料。`;
```

### 2c. Update NEWS_SENTIMENT_GUIDE to handle no-news gracefully

Replace `NEWS_SENTIMENT_GUIDE` with:

```typescript
export const NEWS_SENTIMENT_GUIDE = `新聞情緒分析：
若資料包中有新聞（「新聞：」欄位非「無近期新聞」）：
  對每則新聞評分（-2 到 +2）：
  - sentiment：正負情緒（-2=極負面, +2=極正面）
  - price_impact：對股價的潛在影響（-2=重大利空, +2=重大利多）
  - relevance：與該標的的直接相關度（0=無關, +2=直接相關）
  計算加總分數，給出整體新聞傾向（正面/中性/負面）。

若資料包中「新聞：無近期新聞」：
  跳過新聞評分，在 observations 中寫一條：「[新聞] 無近期新聞，無法進行新聞情緒分析」，然後繼續下一階段。
  不要在 dataQualityNotes 重複說明資料不足。`;
```

### 2d. Update `formatTechnicals` in `compactMarketSummary` to include MACD and Bollinger

Update the `formatTechnicals` inner function inside `compactMarketSummary`:

```typescript
  function formatTechnicals(technicals: TechnicalSummary): string {
    if (technicals.dataPoints < 5) return "技術資料不足";
    const parts: string[] = [];
    if (technicals.rsi14 !== null) parts.push(`RSI=${technicals.rsi14}`);
    if (technicals.macdSignalType) parts.push(`MACD=${technicals.macdSignalType}`);
    if (technicals.bollingerPosition) parts.push(`布林=${technicals.bollingerPosition}`);
    if (technicals.sma20 !== null) parts.push(`SMA20=${technicals.sma20}`);
    if (technicals.sma50 !== null) parts.push(`SMA50=${technicals.sma50}`);
    if (technicals.sma200 !== null) parts.push(`SMA200=${technicals.sma200}`);
    if (technicals.trendDirection !== "insufficient_data") parts.push(`趨勢=${technicals.trendDirection}`);
    if (technicals.pctFrom52wHigh !== null) parts.push(`距52W高點=${technicals.pctFrom52wHigh}%`);
    if (technicals.change1w !== null) parts.push(`1W=${technicals.change1w}%`);
    if (technicals.change1m !== null) parts.push(`1M=${technicals.change1m}%`);
    if (technicals.change3m !== null) parts.push(`3M=${technicals.change3m}%`);
    return parts.join(" ") || "無技術資料";
  }
```

---

## Fix 3: Fix duplicate data in `src/lib/analysis/prompts/portfolio-review.ts`

**Remove the raw JSON dump** — compactMarketSummary already includes portfolio data with formatted technicals. Sending portfolioJson again is redundant and fills context with machine-readable JSON.

Change the function body from:
```typescript
  const portfolioJson = JSON.stringify(dataPackage.portfolio ?? [], null, 2);
  const marketContext = compactMarketSummary(dataPackage);

  return `${roleLine(identity, "Portfolio Review agent")}

...

市場背景：
${marketContext}

持股詳細資料：
${portfolioJson}
```

To:
```typescript
  return `${roleLine(identity, "Portfolio Review agent")}

...

市場與持股資料（包含技術指標、基本面、近期新聞）：
${compactMarketSummary(dataPackage)}
```

Remove the `portfolioJson` variable entirely.

---

## Fix 4: Same duplicate issue in `src/lib/analysis/prompts/team-leader.ts`

Check if `team-leader.ts` also sends full `dataPackageJson`. If it does, replace with `compactMarketSummary`. The team leader already receives all 4 agent outputs — it doesn't need the full raw data package.

---

## Verification

Run `npx tsc --noEmit` — the main TypeScript issue will be that `TechnicalSummary` now has `macdLine`, `macdSignal`, etc. — make sure all three places are updated:
1. The `TechnicalSummary` type definition
2. The `n === 0` early return in `computeTechnicals`
3. The main return value of `computeTechnicals`

After applying, run a test mission. Agents should now:
- Show MACD signal type (bullish/bearish/cross) from computed data
- Show Bollinger position from computed data
- Do qualitative fundamental analysis even when no PE/EPS data is available
- Handle "no news" gracefully without generating multiple "資料不足" entries
- Portfolio review should be shorter (no duplicate data) and higher quality
