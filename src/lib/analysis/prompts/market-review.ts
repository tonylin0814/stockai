import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE, dataPackageJson, roleLine, SKEPTIC_RULE, type PromptIdentity } from "@/lib/analysis/prompts/common";

export function buildMarketReviewPrompt(identity: PromptIdentity, dataPackage: DailyDataPackage) {
  return `${roleLine(identity, "Market Review agent")}

請分析今日市場環境、台股、美股、VIX、美元台幣與 10 年期美債殖利率，並指出此市場環境對 ${identity.teamName} 的重要含義。

資料包 JSON：
${dataPackageJson(dataPackage)}

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 不得編造資料；資料不足時要寫在 dataQualityNotes。
- 只回傳 JSON，不要加 markdown。`;
}
