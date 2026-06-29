import { COMMITTEE_DECISION_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE } from "@/lib/analysis/prompts/common";

export function buildCommitteePrompt(params: {
  divisionDecisions: unknown[];
  consensus: {
    consensusLevel: "strong" | "weak" | "none";
    isActionAllowed: boolean;
    averageConfidence: number;
  };
}) {
  return `你是 Cross-Division Investment Committee，負責比較 GPT Division 與 Claude Division 的決策。

Division decisions JSON：
${JSON.stringify(params.divisionDecisions, null, 2)}

系統已計算出的共識結果 JSON：
${JSON.stringify(params.consensus, null, 2)}

Final committee JSON schema：
${COMMITTEE_DECISION_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- Stage 1 有兩個 division：兩者同意才是 strong consensus 並允許 action。
- 只有一方同意是 weak consensus，不採取新行動。
- consensusLevel 必須使用系統提供的值：${params.consensus.consensusLevel}。
- isActionAllowed 必須使用系統提供的值：${params.consensus.isActionAllowed}。
- 必須指出哪個 division 最保守、哪個最積極。
- 只回傳 JSON，不要加 markdown。`;
}
