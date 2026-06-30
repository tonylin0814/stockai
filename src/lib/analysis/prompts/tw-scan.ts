import type { TwScanItem } from "@/lib/analysis/data-package";

export function buildTwScanPrompt(
  scanUniverse: TwScanItem[],
  marketContext: { taiexPrice: number; taiexChangePct: number; vix: number }
): string {
  const universeText = scanUniverse
    .map((stock) => {
      const sma = [
        stock.sma20 ? `SMA20:${stock.sma20.toFixed(1)}` : "",
        stock.sma60 ? `SMA60:${stock.sma60.toFixed(1)}` : ""
      ]
        .filter(Boolean)
        .join(" ");
      const rsi = stock.rsi14 ? `RSI:${stock.rsi14.toFixed(0)}` : "";
      const high52 = stock.weekHigh52 ? `52週高:${stock.weekHigh52}` : "";
      const low52 = stock.weekLow52 ? `52週低:${stock.weekLow52}` : "";
      const change = `今日${stock.changePct >= 0 ? "+" : ""}${stock.changePct.toFixed(2)}%`;

      return `${stock.symbol} ${stock.name} | 現價:${stock.price} ${change} | ${sma} | ${rsi} | ${high52} ${low52}`.trim();
    })
    .join("\n");

  return `你是一位專注台灣股市的資深選股分析師。

今日大盤環境：
加權指數 ${marketContext.taiexPrice}（今日${marketContext.taiexChangePct >= 0 ? "+" : ""}${marketContext.taiexChangePct.toFixed(2)}%）
VIX ${marketContext.vix}

以下是今日台股掃描標的，已排除使用者現有持股與關注清單：

${universeText}

## 任務

從上述標的中，選出 3 到 5 個最值得關注的機會。每個標的都必須給出多空方向、現價、目標價、停損、空間百分比、信心分數與具體理由。

## 選股標準

1. 技術面突破或跌破：現價突破 SMA60 視為偏多，跌破 SMA20 視為偏弱或觀察。
2. RSI 位置：RSI < 35 可視為超賣反彈，RSI > 70 代表過熱風險。
3. 52 週位置：接近低點後反彈，或突破高點，皆可列入。
4. 今日量價：大漲、大跌、或明顯轉強轉弱都需要搭配數字說明。

## JSON 格式

只回傳 JSON，不要任何說明文字：

{
  "scanSummary": "今日掃描 N 檔，選出 N 個機會。大盤偏多/偏空/震盪，操作偏進攻/防守。",
  "picks": [
    {
      "symbol": "2330",
      "market": "TW",
      "name": "台積電",
      "signal": "bull",
      "currentPrice": 920,
      "targetPrice": "1050",
      "stopLoss": "870",
      "upsidePct": 14.1,
      "timeHorizon": "swing",
      "confidence": 72,
      "reason": "現價 920 突破 SMA60=905，RSI=58 尚未過熱，目標 1050 約 +14%，停損 870 約 -5.4%。",
      "keyRisks": ["大盤轉弱", "外資賣超"]
    }
  ]
}

## 規則

- signal 只能是 bull、bear、neutral。
- currentPrice 必須等於上方資料提供的現價，不可捏造。
- targetPrice 與 stopLoss 必須是單一數字字串，例如 "1050"，不可寫「視情況」。
- upsidePct = (targetPrice - currentPrice) / currentPrice * 100；bear 可為負數。
- reason 必須包含實際 SMA 或 RSI 數字、目標價、停損，1 到 2 句，不超過 80 字。
- confidence 必須在 50 到 85 之間，資料品質不足時偏保守。
- 若 VIX > 30 或加權指數跌幅超過 2%，可只選 1 到 2 個防守型標的。
- 最多 5 檔，不要推薦已經不在清單中的標的。`;
}
