import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { TEAM_REPORT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE, dataPackageJson, roleLine, type PromptIdentity } from "@/lib/analysis/prompts/common";

export function buildTeamLeaderPrompt(params: {
  identity: PromptIdentity;
  dataPackage: DailyDataPackage;
  agentOutputs: Record<string, unknown>;
}) {
  return `${roleLine(params.identity, "team leader")}

你要整合 Market Review、Portfolio Review、Mission Analysis、Market Scan 四個 agent 的輸出，產生完整 team report。你可以接受、修正或降低 agent 的信心，但必須遵守資料品質規則。

資料包 JSON：
${dataPackageJson(params.dataPackage)}

Agent outputs JSON：
${JSON.stringify(params.agentOutputs, null, 2)}

Team report JSON schema 必須完全符合：
${TEAM_REPORT_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- teamName 必須是 "${params.identity.teamName}"。
- leader 必須是 "${params.identity.teamLeader}"。
- date 必須是資料包 packageDate。
- 每一筆 recommendation 都要包含 reason、buyZone、targetPrice、stopLoss、confidence、keyRisks。
- 只回傳 JSON，不要加 markdown。`;
}
