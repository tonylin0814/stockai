export type EnrichedCandidate = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
  avgVolume: number | null;
  sma20: number | null;
  sma60: number | null;
  rsi14: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  volumeAlert: boolean;
};

export function buildMarketAnalysisPrompt(
  market: "TW" | "US",
  currency: string,
  marketSnapshot: { indexPrice: number; indexChangePct: number; vix: number },
  tiers: {
    tier50: EnrichedCandidate[];
    tier100: EnrichedCandidate[];
    tier200: EnrichedCandidate[];
    etfs: EnrichedCandidate[];
  }
): string {
  function formatTier(candidates: EnrichedCandidate[]) {
    if (!candidates.length) return "無資料";

    return candidates
      .map((candidate) => {
        const change = `${candidate.changePct >= 0 ? "+" : ""}${candidate.changePct.toFixed(2)}%`;
        const sma = [
          candidate.sma20 ? `SMA20:${candidate.sma20.toFixed(1)}` : "",
          candidate.sma60 ? `SMA60:${candidate.sma60.toFixed(1)}` : ""
        ]
          .filter(Boolean)
          .join(" ");
        const rsi = candidate.rsi14 ? `RSI:${candidate.rsi14.toFixed(0)}` : "";
        const volume = candidate.volumeAlert ? "量能放大" : "";
        const range52 = [
          candidate.weekLow52 ? `52週低:${candidate.weekLow52}` : "",
          candidate.weekHigh52 ? `52週高:${candidate.weekHigh52}` : ""
        ]
          .filter(Boolean)
          .join(" ");

        return `${candidate.symbol} ${candidate.name} | 現價:${candidate.price} ${change} | ${sma} ${rsi} ${range52} ${volume}`.trim();
      })
      .join("\n");
  }

  return `你是專業選股分析師，分析${market === "TW" ? "台灣" : "美國"}股市今日機會。

大盤環境：
指數 ${marketSnapshot.indexPrice}（今日${marketSnapshot.indexChangePct >= 0 ? "+" : ""}${marketSnapshot.indexChangePct.toFixed(2)}%）
VIX ${marketSnapshot.vix}

候選標的按真實價格分組如下：

${currency}50 以下：
${formatTier(tiers.tier50)}

${currency}100 以下（50 到 100）：
${formatTier(tiers.tier100)}

${currency}200 以下（100 到 200）：
${formatTier(tiers.tier200)}

ETF：
${formatTier(tiers.etfs)}

只輸出 JSON，格式如下：
{
  "sentiment": "bull",
  "sentimentReason": "大盤今日上漲，VIX=16，偏多但仍需留意追高。",
  "picksUnder50": [],
  "picksUnder100": [],
  "picksUnder200": [],
  "etfPicks": []
}

每個推薦格式：
{
  "symbol": "2886",
  "name": "兆豐金",
  "market": "${market}",
  "signal": "bull",
  "currentPrice": 41.5,
  "entryPoint": 40.0,
  "targetPrice": 47.0,
  "stopLoss": 38.5,
  "upsidePct": 13.3,
  "confidence": 68,
  "reason": "現價41.5站上SMA20=40.2，RSI=52，目標47約+13%，停損38.5。",
  "volumeAlert": false
}

規則：
- sentiment 只能是 bull、bear、neutral。
- 每個價格區間最多選 3 個；ETF 最多選 3 個。若候選不足，不要捏造。
- currentPrice 必須等於上方資料現價。
- entryPoint、targetPrice、stopLoss 必須是具體數字。
- upsidePct = (targetPrice - currentPrice) / currentPrice * 100。
- reason 必須包含 SMA 或 RSI 實際數字、目標價、停損，少於 80 字。
- confidence 介於 50 到 85。
- volumeAlert 只能在候選資料顯示「量能放大」時為 true。
- 不要推薦候選清單以外的標的。`;
}
