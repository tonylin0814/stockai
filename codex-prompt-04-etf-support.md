# Codex Task: ETF-Aware Analysis

## Problem

The system treats all securities identically regardless of `securityType`. ETFs like SPCX are analyzed with stock frameworks (Moat, ROIC, Piotroski, EPS) — none of which apply. This produces thin, low-confidence output for ETFs.

## What's Different About ETFs

For a stock: PE, EPS, earnings growth, economic moat, management quality, revenue trends
For an ETF: expense ratio, NAV vs price (premium/discount), benchmark tracking (vs SPY/QQQ), volume/liquidity, sector/strategy exposure, dividend yield

---

## Step 1: Update `src/lib/analysis/prompts/common.ts`

### 1a. Add ETF analysis guide constant

Add this constant after `CATALYST_FRAMEWORK`:

```typescript
// For ETF analysis — replaces stock fundamental framework
export const ETF_ANALYSIS_GUIDE = `ETF 分析框架（適用於 securityType=etf）：
1. 費用率 (Expense Ratio)：年費率是否合理？(<0.2% 優，0.2-0.5% 可接受，>0.5% 偏高)
2. 基準指數比較：相較於 SPY(S&P500) 或同類 ETF，過去 1M/3M/1Y 表現如何？
3. 溢價/折價：市價相對 NAV 是溢價還是折價？
4. 流動性：平均日成交量是否足夠？成交量太低（<50,000股/日）代表流動性風險
5. 策略定位：此 ETF 的投資策略（Sharia合規/ESG/Smart Beta 等）在當前市場環境是否有利？
6. 股息：配息率與頻率是否符合持有目的？
注意：ETF 不適用 Moat、ROIC、Piotroski、EPS 等股票基本面指標，請跳過。`;
```

### 1b. Update `compactMarketSummary` to include securityType and ETF flag

In the `compactMarketSummary` function, update the portfolio and watchlist formatting lines to include `securityType`:

For portfolio items, change:
```typescript
  const portfolio = (dataPackage.portfolio ?? []).map(h =>
    `${h.symbol}(${h.market}) 持股${h.shares}股 成本${h.averageCost} 現價${h.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(h.technicals)}\n  基本面：${formatFundamentals(h.fundamentals)}\n  新聞：${formatNews(h.news)}`
  ).join("\n");
```

To:
```typescript
  const portfolio = (dataPackage.portfolio ?? []).map(h => {
    const isEtf = h.securityType?.toLowerCase() === "etf";
    return `${h.symbol}(${h.market}) [${isEtf ? "ETF" : "股票"}] 持股${h.shares}股 成本${h.averageCost} 現價${h.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(h.technicals)}\n  ${isEtf ? "ETF說明：請使用ETF分析框架，跳過股票基本面指標" : `基本面：${formatFundamentals(h.fundamentals)}`}\n  新聞：${formatNews(h.news)}`;
  }).join("\n");
```

For watchlist items, change:
```typescript
  const watchlist = (dataPackage.watchlist ?? []).map(w =>
    `${w.symbol}(${w.market}) 目標買入${w.targetBuyPrice ?? "N/A"} 現價${w.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(w.technicals)}\n  基本面：${formatFundamentals(w.fundamentals)}\n  新聞：${formatNews(w.news)}`
  ).join("\n");
```

To:
```typescript
  const watchlist = (dataPackage.watchlist ?? []).map(w => {
    const isEtf = w.securityType?.toLowerCase() === "etf";
    return `${w.symbol}(${w.market}) [${isEtf ? "ETF" : "股票"}] 目標買入${w.targetBuyPrice ?? "N/A"} 現價${w.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(w.technicals)}\n  ${isEtf ? "ETF說明：請使用ETF分析框架，跳過股票基本面指標" : `基本面：${formatFundamentals(w.fundamentals)}`}\n  新聞：${formatNews(w.news)}`;
  }).join("\n");
```

---

## Step 2: Update `src/lib/analysis/prompts/portfolio-review.ts`

### 2a. Add ETF_ANALYSIS_GUIDE to imports

```typescript
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  FUNDAMENTAL_QUALITY_GUIDE,
  ETF_ANALYSIS_GUIDE,          // ADD THIS
  CATALYST_FRAMEWORK,
  compactMarketSummary,
  roleLine,
  SKEPTIC_RULE,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";
```

### 2b. In the prompt body, replace the "階段 2：基本面品質評估" section

Change:
```
**階段 2：基本面品質評估（InvestSkill 框架）**
${FUNDAMENTAL_QUALITY_GUIDE}
```

To:
```
**階段 2：基本面 / ETF 特性評估**

若 securityType = ETF（資料中標注 [ETF]）：
${ETF_ANALYSIS_GUIDE}

若 securityType = 股票（資料中標注 [股票]）：
${FUNDAMENTAL_QUALITY_GUIDE}
```

---

## Step 3: Update `src/lib/analysis/prompts/market-scan.ts`

### 3a. Add ETF_ANALYSIS_GUIDE to imports (same as Step 2a)

### 3b. In the prompt body, replace "Step 2：基本面品質評估" section

Change:
```
**Step 2：基本面品質評估（InvestSkill 框架）**
${FUNDAMENTAL_QUALITY_GUIDE}
```

To:
```
**Step 2：基本面 / ETF 特性評估**

若候選標的是 ETF（標注 [ETF]）：
${ETF_ANALYSIS_GUIDE}

若候選標的是股票（標注 [股票]）：
${FUNDAMENTAL_QUALITY_GUIDE}
```

---

## Step 4: Update `src/lib/analysis/prompts/mission-analysis.ts`

In the prompt, after the compactMarketSummary block, add this note for agents:

In the `buildMissionAnalysisPrompt` function, after:
```typescript
市場資料摘要：
${compactMarketSummary(dataPackage)}
```

Add:
```typescript

注意：資料中標注 [ETF] 的標的請使用 ETF 分析框架（費用率、流動性、基準比較），不適用股票基本面分析。
```

---

## Step 5: Add Yahoo Finance ETF data fields to `src/lib/market-data/yahoo.ts`

Yahoo Finance's quote endpoint returns ETF-specific fields. Update `getFundamentals` to capture them when available.

In the `getFundamentals` method, update the return object to add ETF fields:

```typescript
      return {
        pe: toNumber(quote.trailingPE, undefined as unknown as number),
        eps: toNumber(quote.epsTrailingTwelveMonths, undefined as unknown as number),
        marketCap: toNumber(quote.marketCap, undefined as unknown as number),
        // ETF-specific fields (will be undefined for stocks)
        expenseRatio: toNumber(quote.annualReportExpenseRatio, undefined as unknown as number),
        yield: toNumber(quote.yield, undefined as unknown as number),
        ytdReturn: toNumber(quote.ytdReturn, undefined as unknown as number),
        threeYearAverageReturn: toNumber(quote.threeYearAverageReturn, undefined as unknown as number),
        source: "Yahoo Finance",
        qualityState: "delayed"
      };
```

### Also update `src/lib/market-data/types.ts` — add ETF fields to Fundamentals interface

```typescript
export interface Fundamentals {
  pe?: number;
  pb?: number;
  eps?: number;
  marketCap?: number;
  revenueGrowth?: number;
  grossMargin?: number;
  // ETF-specific
  expenseRatio?: number;
  yield?: number;
  ytdReturn?: number;
  threeYearAverageReturn?: number;
  source: string;
  qualityState: DataQualityState;
}
```

### Update `formatFundamentals` in `src/lib/analysis/prompts/common.ts`

Update the function to show ETF data when available:

```typescript
  function formatFundamentals(f: import("@/lib/market-data/types").Fundamentals | null): string {
    if (!f || f.qualityState === "missing") return "基本面資料不足";
    const parts: string[] = [];
    // Stock fields
    if (f.pe) parts.push(`PE=${f.pe.toFixed(1)}`);
    if (f.eps) parts.push(`EPS=${f.eps.toFixed(2)}`);
    if (f.grossMargin) parts.push(`毛利率=${(f.grossMargin * 100).toFixed(1)}%`);
    if (f.marketCap) parts.push(`市值=${(f.marketCap / 1e9).toFixed(1)}B`);
    // ETF fields
    if (f.expenseRatio) parts.push(`費用率=${(f.expenseRatio * 100).toFixed(2)}%`);
    if (f.yield) parts.push(`殖利率=${(f.yield * 100).toFixed(2)}%`);
    if (f.ytdReturn) parts.push(`YTD=${(f.ytdReturn * 100).toFixed(1)}%`);
    if (f.threeYearAverageReturn) parts.push(`3Y年化=${(f.threeYearAverageReturn * 100).toFixed(1)}%`);
    return parts.join(" ") || "資料不足";
  }
```

---

## Verification

Run `npx tsc --noEmit` — confirm zero errors.

Then run a test mission. For SPCX you should now see:
- Agent output acknowledges it's an ETF and uses the ETF framework
- Shows expense ratio and YTD return if Yahoo Finance returns them
- Compares SPCX technical performance vs S&P500 (which is already in marketSnapshot)
- Does NOT attempt Moat/ROIC/Piotroski analysis
- Confidence score should reflect that ETF analysis has fewer data dimensions but is still valid
