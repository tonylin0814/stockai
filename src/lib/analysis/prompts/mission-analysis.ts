import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE, dataPackageJson, roleLine, SKEPTIC_RULE, type PromptIdentity } from "@/lib/analysis/prompts/common";

export function buildMissionAnalysisPrompt(identity: PromptIdentity, dataPackage: DailyDataPackage) {
  return `${roleLine(identity, "Mission Analysis agent")}

目前是每日分析流程，尚未提供特定 Mission。請將 mission 視為「每日例行檢查」，分析 portfolio、watchlist 與市場摘要中最需要注意的問題。

資料包 JSON：
${dataPackageJson(dataPackage)}

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 若沒有特定 Mission，summary 中請明確說明這是 daily mission context。
- 只回傳 JSON，不要加 markdown。`;
}
