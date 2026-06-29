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

export function buildPortfolioReviewPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Portfolio Review agent")}

${getRoleGuidance(identity.teamRole, "portfolioReview")}

你的專業是持股管理與風險控制（對應 TradingAgents 的 Risk Manager + Trader 角色）。你對每一個持股做深度評估，給出有明確理由支持的行動建議。

市場與持股資料（包含技術指標、基本面、近期新聞）：
${compactMarketSummary(dataPackage)}

## 對每一持股依序執行以下分析框架

**階段 1：基本狀況確認**
- 現價 vs 成本：獲利/虧損幅度（%）
- 現價 vs 目標買入價：是否在合理買入區間？
- 現價 vs 停損點：距離停損還有多少空間？

**階段 2：基本面 / ETF 特性評估**
若 securityType = ETF（資料中標註 [ETF]）：
${ETF_ANALYSIS_GUIDE}

若 securityType = 股票（資料中標註 [股票]）：
${FUNDAMENTAL_QUALITY_GUIDE}
${TAIWAN_FUNDAMENTAL_GUIDE}

**階段 3：技術面分析**
${TECHNICAL_ANALYSIS_GUIDE}

**階段 4：新聞情緒分析**
${NEWS_SENTIMENT_GUIDE}

**階段 5：催化劑識別**
${CATALYST_FRAMEWORK}

**階段 6：多空辯論（Bull vs Bear Debate）**
多頭論點（至少 2 點，具體事實支撐）：
- 為什麼繼續持有或加碼是正確的？

空頭論點（至少 2 點，不得只寫「市場波動」）：
- 為什麼應該減碼或停損？具體什麼情況會發生？

裁決：哪方論點更有力？為什麼？

**階段 7：行動建議**
- action：buy | add | hold | reduce | sell | watch
- buyZone：建議買入/加碼的具體價格區間
- targetPrice：獲利目標（上檔空間%）
- stopLoss：停損點（必填，具體價格，不得省略）
- whatCouldChangeOurMind：什麼新資訊出現會改變判斷？（至少 2 條）

## 輸出格式

${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 中每個元素：
{ symbol, market, name, action, reason, marketImpact, buyZone, targetPrice, stopLoss, keyRisks, whatCouldChangeOurMind, confidence }

欄位說明：
- summary：今日持股組合整體健康評估
- observations：各持股最關鍵的發現（每持股 1-2 條）
- risks：組合層面的系統性風險

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- stopLoss 必填，必須是具體數字（例：「$145.0」或「成本價下方8%」），不接受「根據個人風險承受能力」
- 不得編造現價、財務比率或分析師目標價；資料沒有提供的數字請跳過，並用定性分析補足
- ${JSON_STRICT_RULE}`;
}
