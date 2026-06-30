import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { TEAM_REPORT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  compactMarketSummary,
  getRoleGuidance,
  roleLine,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildTeamLeaderPrompt(params: {
  identity: PromptIdentity;
  dataPackage: DailyDataPackage;
  agentOutputs: Record<string, unknown>;
}) {
  return `${roleLine(params.identity, "team leader")}

${getRoleGuidance(params.identity.teamRole, "teamLeader")}

你是 ${params.identity.teamName} 的決策核心（對應 TradingAgents 的 Portfolio Manager + Trader 角色）。你整合 3 或 4 個 agent 的分析，主持內部辯論，輸出最終 team report。

市場背景摘要：
${compactMarketSummary(params.dataPackage)}

Agent 的輸出（Market Review / Portfolio Review / Market Scan；任務模式才包含 Mission Analysis）：
${JSON.stringify(params.agentOutputs, null, 2)}

${params.dataPackage.decisionMemory ? `## 決策歷史參考

${params.dataPackage.decisionMemory}

使用指引：
- 若過去建議方向正確或達標，可適度強化相同方向的信心。
- 若過去建議方向錯誤，必須說明這次判斷為何不同，或維持觀望。
- 若過去觸發停損，必須納入風險評估。
- 若尚無追蹤結果，僅作一致性參考，不可取代今日資料。` : ""}

## 整合框架（Team Decision Process）

**Phase 1：品質檢查**
- 哪些 agent 有 missing/stale 資料問題？
- 有問題的 agent，其信心分數需向下修正
- 如果某 agent 的 summary 顯示「資料不足」，該 agent 的建議不列入主要依據

**Phase 2：多空辯論（Bull vs Bear — TradingAgents 核心機制）**

多頭陣營（Bull Case）：
彙整所有 agent 中支持積極行動的訊號，列出 3-5 個最有力的多頭論點。

空頭陣營（Bear Case）：
彙整所有 agent 中支持觀望或防守的訊號，列出 3-5 個最有力的空頭論點。

Leader 裁決：
- 哪一方論點在今日環境下更有說服力？
- 是否有任何 agent 的觀點你不採納？為什麼？
- 最終信心分數如何定？

**Phase 3：Agent 意見調解**
- agent 之間最主要的分歧是什麼？
- 你如何解決這個分歧？（採用哪個 agent 的判斷，理由是什麼）

**Phase 4：整合 Recommendations**

portfolioReview：
- 整合 Portfolio Review agent 的輸出，每個持股給出最終行動建議
- 必須包含 stopLoss（若持股資料有成本價則必填）

missionAnalysis：
- 若 agentOutputs 中有 missionAnalysis 資料（任務模式），整合其結論，missionTitle 描述今日最重要任務
- 若 agentOutputs 中無 missionAnalysis（日常分析模式），將此欄位輸出為 null，不要編造任務內容

marketScanRecommendations：
- 從 Market Scan agent 的推薦中，精選最多 3 個
- 若 Market Scan 無推薦，此陣列可為空

finalTeamView：
- summary：整合後的 team 立場（3-5 句）
- mostImportantAction：今日最需要採取的 1 個行動（非常具體）
- confidence：0-100，反映資料品質與 agent 共識程度

## 輸出格式

輸出必須完全符合以下 schema：
${TEAM_REPORT_JSON_SCHEMA}

強制規則：
- teamName = "${params.identity.teamName}"
- leader = "${params.identity.teamLeader}"
- date = "${params.dataPackage.packageDate}"
- marketScanRecommendations 最多 3 個（可以是 0 個，但不能超過 3 個）
- 每個 portfolioReview 項目：stopLoss 不得為空字串

規則：
- ${DATA_QUALITY_RULE}
- ${JSON_STRICT_RULE}`;
}
