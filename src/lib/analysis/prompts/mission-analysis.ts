import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  EARNINGS_RISK_GUIDE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  CATALYST_FRAMEWORK,
  SCENARIO_ANALYSIS_GUIDE,
  compactMarketSummary,
  getRoleGuidance,
  roleLine,
  SKEPTIC_RULE,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildMissionAnalysisPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Mission Analysis agent")}

${getRoleGuidance(identity.teamRole, "missionAnalysis")}

你的專業是任務評估與每日優先排序。目前沒有特定任務，你負責執行「每日例行掃描」：找出投資組合與關注清單中今日最需要立即關注的 1-2 件事。

市場資料摘要：
${compactMarketSummary(dataPackage)}

注意：資料中標註 [ETF] 的標的請使用 ETF 分析框架（費用率、流動性、基準比較），不適用股票基本面分析。

## 每日掃描框架（Daily Intelligence Scan）

**掃描 1：緊急警示（需要立即行動）**
- 有無持股跌破停損或接近停損（差距 ≤ 5%）？
- 有無持股漲到目標價附近（距目標 ≤ 5%）？
- 今日有無重大新聞直接衝擊持股？

**掃描 2：機會訊號**
- 關注清單中有無標的進入目標買入區間？
- 有無因大盤修正導致優質股出現異常低價？

**掃描 3：重要事件日曆**
- 本週/本月是否有重要財報、法說會、央行決議、經濟數據？
- 這些事件對持股有什麼潛在影響？

**掃描 4：最值得關注標的的催化劑分析**
針對掃描到的最重要標的：
${CATALYST_FRAMEWORK}

**掃描 5：新聞情緒評分（針對最重要標的）**
${NEWS_SENTIMENT_GUIDE}

${dataPackage.upcomingEarnings?.length ? `**掃描 6：財報風險評估**
${EARNINGS_RISK_GUIDE}
特別注意：若投資組合中有標的在 7 天內公布財報，這必須成為今日最優先的警示事項。
` : ""}

**今日最優先任務**
- missionTitle：30 字以內描述今日最重要的分析任務
- suggestion：今日最優先的行動建議（buy/wait/hold/reduce/sell/reject）
- conditionsToAct：什麼條件成立後才採取行動？（至少 2 條具體條件）

## 輸出格式

${SCENARIO_ANALYSIS_GUIDE}

${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 應包含今日最值得關注的 1-2 個行動項目：
{ symbol, action, reason, priority: "high|medium|low", conditionsToAct, scenarios }

欄位說明：
- summary：開頭必須是「每日例行分析 - [日期]」，然後描述今日最重要的發現
- observations：具體的警示訊號或機會訊號
- risks：若不採取行動會有什麼後果？

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 若投資組合和關注清單都為空，summary 必須說明無法分析，並建議先新增持股或關注標的
- ${JSON_STRICT_RULE}`;
}
