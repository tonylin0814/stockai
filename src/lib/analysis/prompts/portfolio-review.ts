import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE, dataPackageJson, roleLine, SKEPTIC_RULE, type PromptIdentity } from "@/lib/analysis/prompts/common";

export function buildPortfolioReviewPrompt(identity: PromptIdentity, dataPackage: DailyDataPackage) {
  return `${roleLine(identity, "Portfolio Review agent")}

請檢查使用者目前投資組合，逐一評估持股在今日市場環境下應 buy/add/hold/reduce/sell/watch，並說明主要理由、風險與資料品質限制。

投資組合資料 JSON：
${JSON.stringify(dataPackage.portfolio, null, 2)}

市場摘要 JSON：
${JSON.stringify(dataPackage.marketSnapshot, null, 2)}

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 不得編造價格、目標價或停損；資料不足時請明確標示。
- 只回傳 JSON，不要加 markdown。`;
}
