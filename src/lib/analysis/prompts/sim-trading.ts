export type TradingContext = {
  startingBudget: number;
  availableCash: number;
  openPositions: Array<{
    symbol: string;
    name: string;
    shares: number;
    avgCost: number;
    currentPrice: number;
    stopFlagged: boolean;
    sma20?: number | null;
    sma60?: number | null;
    rsi14?: number | null;
  }>;
  todayTrades: Array<{
    action: "buy" | "sell";
    symbol: string;
    shares: number;
    pricePerShare: number;
  }>;
  candidates: Array<{
    symbol: string;
    name: string;
    price: number;
    changePct: number;
    sma20?: number | null;
    sma60?: number | null;
    rsi14?: number | null;
    weekLow52?: number | null;
    weekHigh52?: number | null;
  }>;
  indexPrice: number;
  indexChangePct: number;
  vix?: number | null;
};

export function buildTradingDecisionPrompt(
  division: "gpt" | "anthropic",
  market: "US" | "TW",
  context: TradingContext
) {
  const currency = market === "US" ? "USD" : "TWD";
  const maxPositions = 3;
  const moneyPrefix = currency === "USD" ? "$" : "NT$";
  const positionsText = context.openPositions.length
    ? context.openPositions
        .map((position) => {
          const pnl =
            position.avgCost > 0
              ? ((position.currentPrice - position.avgCost) / position.avgCost) * 100
              : 0;
          const stopFlag = position.stopFlagged
            ? " 已觸發-15%停損警示，必須決定是否繼續持有"
            : "";
          return `${position.symbol} ${position.name}: ${position.shares}股 | 成本${position.avgCost} | 現價${position.currentPrice} | ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%${stopFlag}
技術：SMA20=${position.sma20 ?? "N/A"} SMA60=${position.sma60 ?? "N/A"} RSI=${position.rsi14 ?? "N/A"}`;
        })
        .join("\n")
    : "（無持倉）";

  const candidatesText = context.candidates.length
    ? context.candidates
        .map(
          (candidate) =>
            `${candidate.symbol} ${candidate.name} | 現價:${candidate.price} | 今日${candidate.changePct >= 0 ? "+" : ""}${candidate.changePct.toFixed(2)}% | SMA20:${candidate.sma20 ?? "N/A"} SMA60:${candidate.sma60 ?? "N/A"} RSI:${candidate.rsi14 ?? "N/A"} | 52W低:${candidate.weekLow52 ?? "N/A"} 52W高:${candidate.weekHigh52 ?? "N/A"}`
        )
        .join("\n")
    : "（目前沒有可交易候選標的）";

  const todayTradesText = context.todayTrades.length
    ? context.todayTrades
        .map(
          (trade) =>
            `${trade.action === "buy" ? "買入" : "賣出"} ${trade.symbol} ${trade.shares}股 @ ${trade.pricePerShare}`
        )
        .join("\n")
    : "（今日尚無操作）";

  return `你是 ${division === "gpt" ? "GPT Division" : "Anthropic Division"} 的 ${market} 市場交易員。

## 當前狀況

可用現金：${moneyPrefix}${context.availableCash.toFixed(2)}
持倉數量：${context.openPositions.length} / ${maxPositions} 個

## 當前持倉
${positionsText}

## 今日已執行操作（同一標的今日不得反向操作）
${todayTradesText}

## 市場候選標的
${candidatesText}

## 大盤環境
${market === "US"
    ? `S&P 500: ${context.indexPrice} (${context.indexChangePct >= 0 ? "+" : ""}${context.indexChangePct.toFixed(2)}%) | VIX: ${context.vix ?? "N/A"}`
    : `加權指數: ${context.indexPrice} (${context.indexChangePct >= 0 ? "+" : ""}${context.indexChangePct.toFixed(2)}%)`}

## 交易規則（嚴格遵守）
1. 最多持有 ${maxPositions} 個部位，現有 ${context.openPositions.length} 個，最多可新增 ${Math.max(0, maxPositions - context.openPositions.length)} 個。
2. 同一標的今日若已買，不得賣；今日若已賣，不得買。
3. 單一部位不得超過起始資金的 40%（${moneyPrefix}${(context.startingBudget * 0.4).toFixed(0)}）。
4. 只能做多，不可做空。
5. 賣出時只能賣已持有的股數。

## 你的任務

根據技術分析和市場環境，決定今日操作。輸出 JSON：

{
  "decisions": [
    {
      "action": "buy" | "sell" | "hold",
      "symbol": "AAPL",
      "market": "${market}",
      "name": "Apple Inc.",
      "shares": 5,
      "thesis": "主要投資理由（2-3句，說明為何現在是好時機）",
      "technicalBasis": "具體技術分析（必須包含SMA/RSI實際數字）",
      "fundamentalBasis": "基本面因素（可選）",
      "riskFactors": "主要風險（1-2條）",
      "targetPrice": 195.0,
      "stopLoss": 178.0,
      "conviction": 72
    }
  ],
  "noActionReason": "若不採取任何行動，說明原因（可選）",
  "marketAssessment": "對今日市場的整體看法（1-2句）"
}

規則：
- "hold" 動作不需要 shares/thesis 等欄位，只需 symbol 和 action。
- 若持倉有停損警示，必須在 decisions 中包含該標的（hold 或 sell）。
- conviction 介於 50–85。
- targetPrice 和 stopLoss 必須是具體數字。
- shares 必須是整數，且總金額不超過可用現金和 40% 限制。
- 只輸出 JSON。`;
}
