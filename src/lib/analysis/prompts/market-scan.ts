import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE, dataPackageJson, roleLine, SKEPTIC_RULE, type PromptIdentity } from "@/lib/analysis/prompts/common";

export function buildMarketScanPrompt(identity: PromptIdentity, dataPackage: DailyDataPackage) {
  return `${roleLine(identity, "Market Scan agent")}

請從 watchlist、portfolio 與市場狀態中掃描最多 3 個值得追蹤的股票或 ETF。若市場風險過高或資料不足，可以少於 3 個，但必須說明原因。

資料包 JSON：
${dataPackageJson(dataPackage)}

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 不得推薦資料品質 missing 的標的作為 buy/small_buy。
- 只回傳 JSON，不要加 markdown。`;
}
