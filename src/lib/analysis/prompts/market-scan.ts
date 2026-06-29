import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  CATALYST_FRAMEWORK,
  DATA_QUALITY_RULE,
  ETF_ANALYSIS_GUIDE,
  FUNDAMENTAL_QUALITY_GUIDE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  SKEPTIC_RULE,
  TAIWAN_FUNDAMENTAL_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  compactMarketSummary,
  getRoleGuidance,
  roleLine,
  type PromptIdentity
} from "@/lib/analysis/prompts/common";

export function buildMarketScanPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Market Scan agent")}

${getRoleGuidance(identity.teamRole, "marketScan")}

你的專業是市場機會發掘（對應 Agentic Financial Analyst 的 Recommendation Engine 角色）。你從關注清單和整體市場中篩選出今日最具投資價值的 0-3 個標的，給出有數據支撐的進場建議。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 篩選流程（Screening Pipeline）

**Step 1：初步篩選**
對每個關注清單標的，確認：
- 資料品質是否 OK（missing 的標的不得給出 buy/small_buy）
- 現價是否在目標買入區間內或接近合理區間
- 當前市場環境（VIX、趨勢、板塊環境）是否支持該標的

**Step 2：基本面 / ETF 特性評估**
若候選標的是 ETF（標註 [ETF]）：
${ETF_ANALYSIS_GUIDE}

若候選標的是股票（標註 [股票]）：
${FUNDAMENTAL_QUALITY_GUIDE}
${TAIWAN_FUNDAMENTAL_GUIDE}

**Step 3：技術面確認**
${TECHNICAL_ANALYSIS_GUIDE}

**Step 4：新聞情緒分析**
${NEWS_SENTIMENT_GUIDE}

**Step 5：催化劑評估**
${CATALYST_FRAMEWORK}

**Step 6：競爭/板塊脈絡（FinRobot 框架）**
- 該標的在其所屬板塊中排名如何？（龍頭/跟隨者/落後者）
- 相較同業，估值是偏高/合理/偏低？
- 板塊整體趨勢是否有利？

**Step 7：綜合評分（0-100）**
- 價格位置分（0-25）：現價是否在目標買入區間？
- 市場環境分（0-25）：當前 VIX、趨勢、板塊環境是否有利？
- 技術面分（0-25）：技術指標有無明確訊號？
- 基本面/新聞分（0-25）：品質評估 + 情緒評分

**Step 8：最終篩選**
根據你的綜合評分和今日市場環境，決定推薦幾個標的（0-3 個）及推薦強度。
考量因素：市場整體風險水準、每個候選的評分、你對今日操作信心。
若市場風險高，你可以選擇推薦 0 個並說明原因。
若市場平靜且有明確機會，最多推薦 3 個。
由你判斷，不要按 VIX 數字自動計算推薦數量。

## 輸出格式

${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 每個元素：
{ symbol, market, name, reason, buyZone, targetPrice, stopLoss, timeHorizon, confidence, keyRisks, compositeScore, catalystSummary }

欄位說明：
- summary：今日掃描結論，說明篩選了幾個候選、通過幾個
- observations：篩選過程的關鍵發現（包括被排除的候選及排除原因）
- risks：推薦標的的共同市場風險

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 每個推薦必須有具體的 buyZone、targetPrice、stopLoss，不接受「依個人評估」
- compositeScore 必須填入你計算的 0-100 評分
- ${JSON_STRICT_RULE}`;
}
