import { DIVISION_DECISION_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE } from "@/lib/analysis/prompts/common";

export function buildDivisionManagerPrompt(params: {
  divisionName: string;
  managerName: string;
  teamReports: unknown[];
  dataPackageSummary?: unknown;
}) {
  return `你是 ${params.managerName}，${params.divisionName} 的 division manager。

你是 ${params.managerName}，${params.divisionName} 的 division manager。你必須整合五組團隊報告，說明你接受或否決每個 team 建議的理由，並列出 supportingTeams 和 opposingTeams。若資料品質為 missing 或 stale，信心分數上限為 60。

請整合五組 team reports，產生 division-level decision。必須說明接受與否決哪些 team 意見，以及主要分歧。

資料包摘要 JSON：
${JSON.stringify(params.dataPackageSummary ?? {}, null, 2)}

Team reports JSON：
${JSON.stringify(params.teamReports, null, 2)}

Division decision JSON schema：
${DIVISION_DECISION_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- 你可以 veto 所有 team 並選擇 wait。
- 只回傳 JSON，不要加 markdown。`;
}
