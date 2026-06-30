# Codex Task: Improve All AI Prompt Files

## Context

This system has a multi-agent investment analysis pipeline with 28 agents per full run. The current prompts are too minimal — they dump the entire `dataPackage` JSON into every agent (thousands of tokens repeated 25+ times) and give agents insufficient structure to produce consistent, insightful output. We need to fix this in two ways:

1. **Token efficiency**: Replace full `dataPackageJson(dataPackage)` calls with a compact summary helper in leaf agents
2. **Prompt quality**: Give each agent richer, structured instructions based on best practices from TradingAgents and PrimoAgent frameworks

---

## Files to Edit

- `src/lib/analysis/prompts/common.ts`
- `src/lib/analysis/prompts/market-review.ts`
- `src/lib/analysis/prompts/portfolio-review.ts`
- `src/lib/analysis/prompts/mission-analysis.ts`
- `src/lib/analysis/prompts/market-scan.ts`
- `src/lib/analysis/prompts/team-leader.ts`
- `src/lib/analysis/prompts/division-manager.ts`
- `src/lib/analysis/prompts/committee.ts`

Do NOT touch `src/lib/analysis/schemas.ts` — the JSON output schemas are already correct.

---

## Step 1: Update `src/lib/analysis/prompts/common.ts`

Replace the entire file with this:

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";

export type PromptIdentity = {
  agentName: string;
  teamName: string;
  teamLeader: string;
  divisionName: string;
  divisionManager: string;
};

export const DATA_QUALITY_RULE =
  "若資料品質為 missing 或 stale，信心分數上限為 60。若關鍵資料為 missing，action 必須是 wait 或 insufficient_data，不得給出 buy 或 small_buy。";

export const SKEPTIC_RULE =
  "你必須至少指出一個可能的錯誤或風險。若真的找不到，必須明確說明為什麼沒有問題。";

export const JSON_STRICT_RULE =
  "重要：只回傳純 JSON 物件，不加 markdown、不加說明文字、不加 ```。JSON 必須完整，不得截斷。所有必填欄位都必須存在。";

export const ACTION_VALUES =
  "可用 action 值（只能用這些）：buy | small_buy | add | hold | wait | watch | reduce | sell | avoid | reject | insufficient_data";

export const NEWS_SENTIMENT_GUIDE = `量化新聞情緒評分（每項 -2 到 +2 分）：
- news_relevance: 新聞與該標的的直接相關程度（-2=無關, +2=高度相關）
- sentiment: 正面/負面情緒（-2=極度負面, +2=極度正面）
- price_impact_potential: 對股價的潛在影響力（-2=重大利空, +2=重大利多）
- trend_direction: 新聞是否符合近期趨勢（-2=逆趨勢, +2=順趨勢）
- earnings_impact: 對獲利的預期影響（-2=嚴重損害, +2=顯著提升）
- investor_confidence: 對投資人信心的影響（-2=打擊信心, +2=大幅提振）
評分說明需包含：各項分數 + 加總 + 整體解讀`;

export const TECHNICAL_ANALYSIS_GUIDE = `技術面分析重點（若有相關資料）：
- RSI(14)：>70 超買、<30 超賣、50 為多空分界
- MACD：金叉/死叉訊號、柱狀圖縮放
- 布林通道：股價相對上/中/下軌位置
- 移動平均線：SMA20、SMA50、SMA200 多空排列
- 趨勢強度：ADX>25 代表有明確趨勢
若無法取得技術指標，需在 dataQualityNotes 說明`;

/** 
 * Compact market context for leaf agents — replaces full dataPackageJson.
 * Reduces input tokens by ~60-70% while preserving decision-critical info.
 */
export function compactMarketSummary(dataPackage: DailyDataPackage): string {
  const snap = dataPackage.marketSnapshot;
  const portfolio = (dataPackage.portfolio ?? [])
    .map(
      (h) =>
        `${h.symbol}(${h.market}) 持股${h.shares}股 成本${h.averageCost} 現價${h.currentPrice ?? "N/A"}`
    )
    .join(" | ");
  const watchlist = (dataPackage.watchlist ?? [])
    .map(
      (w) =>
        `${w.symbol}(${w.market}) 目標買入${w.targetBuyPrice ?? "N/A"}`
    )
    .join(" | ");

  return `日期：${dataPackage.packageDate}
市場指標：TAIEX ${snap?.taiex?.price ?? "N/A"} | S&P500 ${snap?.sp500?.price ?? "N/A"} | VIX ${snap?.vix?.price ?? "N/A"} | USD/TWD ${snap?.usdtwd?.price ?? "N/A"} | 10Y美債 ${snap?.us10y?.price ?? "N/A"}%
持股：${portfolio || "無"}
關注清單：${watchlist || "無"}
資料品質：${JSON.stringify(dataPackage.dataQualitySummary ?? {})}`;
}

export function dataPackageJson(dataPackage: DailyDataPackage) {
  return JSON.stringify(dataPackage, null, 2);
}

export function roleLine(identity: PromptIdentity, role: string) {
  return `你是 ${identity.agentName}，${identity.teamName} 的 ${role}。Division：${identity.divisionName}，Division Manager：${identity.divisionManager}。`;
}
```

---

## Step 2: Update `src/lib/analysis/prompts/market-review.ts`

Replace the entire file with this:

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  compactMarketSummary,
  roleLine,
  SKEPTIC_RULE,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildMarketReviewPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Market Review agent")}

你的專業是宏觀市場分析。你負責評估今日整體市場環境，判斷風險偏好方向，並為 ${identity.teamName} 的其他 agent 提供市場背景。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 分析框架（請依序思考）

**1. 宏觀環境判斷**
- VIX 水平與趨勢：<15 低波動、15-25 中性、>25 高恐慌
- 美債 10Y 殖利率方向：上升對成長股的壓力、下降對防禦股的影響
- USD/TWD 走勢：強美元對台股出口商的影響
- S&P500 與 TAIEX 相對強弱

**2. 市場偏向（必須選一個）**
- bullish：風險指標低、主要指數上漲、資金流入明顯
- neutral：訊號混合、等待方向確認
- bearish：VIX 偏高、指數下跌、防禦情緒主導

**3. 強勢 / 弱勢板塊識別**
- 根據市場環境推斷哪些板塊受益、哪些承壓

**4. 量化新聞情緒評估**
${NEWS_SENTIMENT_GUIDE}

**5. 技術指標概況**
${TECHNICAL_ANALYSIS_GUIDE}

**6. 對 ${identity.teamName} 的含義**
- 這個市場環境對你的 team 分析的具體影響是什麼？
- 有哪些訊號特別需要關注？

## 輸出格式

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

欄位說明：
- summary：2-3 句市場環境總結，必須包含 marketBias 判斷依據
- observations：列出 4-6 項具體觀察，每項以數字或事實支撐
- recommendations：今日市場環境下的操作建議（可為空陣列若市場無方向）
- risks：列出 2-4 項主要下行風險
- dataQualityNotes：說明哪些資料是 missing 或 stale
- confidence：0-100，根據資料完整性調整

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 3: Update `src/lib/analysis/prompts/portfolio-review.ts`

Replace the entire file with this:

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  compactMarketSummary,
  roleLine,
  SKEPTIC_RULE,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildPortfolioReviewPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  const portfolioJson = JSON.stringify(dataPackage.portfolio ?? [], null, 2);
  const marketContext = compactMarketSummary(dataPackage);

  return `${roleLine(identity, "Portfolio Review agent")}

你的專業是持股管理與風險控制。你負責逐一評估投資組合中每一個持股的當前狀況，並給出今日最適當的行動建議。

市場背景：
${marketContext}

持股詳細資料：
${portfolioJson}

## 分析框架（對每一持股依序執行）

**1. 基本狀況確認**
- 現價 vs 成本價：獲利/虧損幅度？
- 現價 vs 目標買入價：是否在合理區間？

**2. 多空論點對比（Bull vs Bear）**
- 多頭理由：為什麼繼續持有或加碼？（至少 2 點）
- 空頭理由：為什麼應該減碼或停損？（至少 2 點）
- 哪一方論點更強？

**3. 技術面評估**
${TECHNICAL_ANALYSIS_GUIDE}

**4. 新聞情緒評分（若有相關新聞）**
${NEWS_SENTIMENT_GUIDE}

**5. 市場環境匹配度**
- 目前的 VIX、板塊趨勢是否有利於這個持股？
- 若大盤轉弱，此持股的下行保護如何？

**6. 行動建議**
可選：buy | add | hold | reduce | sell | watch
- buyZone：建議加碼區間（若適用）
- targetPrice：目標獲利出場價
- stopLoss：停損點（風控必填，不得省略）
- whatCouldChangeOurMind：什麼新資訊或條件出現會改變判斷？

## 輸出格式

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 陣列中每個元素應包含：
{ symbol, market, name, action, reason, buyZone, targetPrice, stopLoss, keyRisks, whatCouldChangeOurMind, confidence }

欄位說明：
- summary：今日持股組合整體健康狀況
- observations：各持股的關鍵觀察
- risks：整體組合層面的風險
- dataQualityNotes：資料缺失說明

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 停損點必填，不得以「根據個人風險承受能力」帶過，必須給具體價格或百分比
- 不得編造現價或財務數字；資料不足時在 dataQualityNotes 說明
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 4: Update `src/lib/analysis/prompts/mission-analysis.ts`

Replace the entire file with this:

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  compactMarketSummary,
  roleLine,
  SKEPTIC_RULE,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildMissionAnalysisPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Mission Analysis agent")}

你的專業是任務評估與每日優先排序。目前是每日例行分析，沒有特定任務。你的工作是：找出投資組合與關注清單中「今日最需要關注的 1-2 件事」，並給出明確建議。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 分析框架

**1. 掃描警示信號**
從以下角度找出最需要行動的標的：
- 持股中有無接近停損點（現價 vs 停損 ≤ 5%）？
- 持股中有無達到目標價、可考慮出場的標的？
- 關注清單中有無進入目標買入區間的標的？
- 有無重大新聞或事件即將影響持股？

**2. 每日市場議題**
- 今天最重要的宏觀風險是什麼？
- 這週有哪些重要的數據或財報（若資料包中有提及）？

**3. 新聞情緒評分（針對最需要關注的標的）**
${NEWS_SENTIMENT_GUIDE}

**4. 任務總結**
- missionTitle：簡短描述今日最重要的任務（如「檢查 TSMC 是否觸及停損」）
- suggestion：今日最優先的行動建議
- conditionsToAct：什麼條件成立才採取行動？

## 輸出格式

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 應包含今日最值得關注的 1-2 個標的或行動項目，每項包含：
{ symbol, action, reason, priority: "high|medium|low", conditionsToAct }

欄位說明：
- summary：今日最需要關注的問題，開頭明確說明「每日例行分析」
- observations：找出的具體警示訊號
- risks：若不採取行動的風險
- dataQualityNotes：資料缺失或過時說明

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 若投資組合和關注清單都為空，summary 必須說明無法分析，並建議先新增持股或關注標的
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 5: Update `src/lib/analysis/prompts/market-scan.ts`

Replace the entire file with this:

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  compactMarketSummary,
  roleLine,
  SKEPTIC_RULE,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildMarketScanPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Market Scan agent")}

你的專業是市場機會發掘。你負責從 watchlist 和整體市場中篩選出今日最具投資價值的 1-3 個標的，給出具體的進場建議。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 篩選框架

**1. 候選標的評分（每個關注清單標的依序評估）**

對每個候選標的計算綜合評分（0-100）：
- 價格位置分數（0-25）：現價是否在目標買入區間內或接近？
- 市場環境分數（0-25）：當前 VIX、板塊趨勢是否有利？
- 技術面分數（0-25）：技術指標是否有買入訊號？
- 新聞情緒分數（0-25）：新聞面是否正向？

${NEWS_SENTIMENT_GUIDE}

${TECHNICAL_ANALYSIS_GUIDE}

**2. 篩選標準**
只推薦同時符合以下條件的標的：
- 綜合評分 ≥ 60
- 資料品質不是 missing（missing 的標的不得推薦為 buy/small_buy）
- 有明確的停損點（風險可量化）
- 當前市場環境支持該標的的板塊

**3. 風險等級判斷**
- 高風險（VIX>25 或 bearish 市場）：最多推薦 1 個，偏向 watch
- 中性市場：最多推薦 2 個
- 低風險、bullish 市場：最多推薦 3 個

**4. 若無符合標的**
若市場風險過高或找不到符合條件的標的，recommendations 可為空陣列，但 summary 必須解釋原因。

## 輸出格式

輸出必須是有效 JSON，schema 如下：
${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 陣列中每個元素應包含：
{ symbol, market, name, reason, buyZone, targetPrice, stopLoss, timeHorizon, confidence, keyRisks, compositeScore }

欄位說明：
- summary：今日市場掃描結論，說明推薦或不推薦的核心原因
- observations：篩選過程的關鍵發現
- risks：推薦標的的主要共同風險

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 每個推薦必須有具體的 buyZone、targetPrice、stopLoss（不得只寫「依個人評估」）
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 6: Update `src/lib/analysis/prompts/team-leader.ts`

Replace the entire file with this:

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { TEAM_REPORT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  compactMarketSummary,
  roleLine,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildTeamLeaderPrompt(params: {
  identity: PromptIdentity;
  dataPackage: DailyDataPackage;
  agentOutputs: Record<string, unknown>;
}) {
  return `${roleLine(params.identity, "team leader")}

你是 ${params.identity.teamName} 的決策核心。你必須整合 4 個 agent 的分析輸出，主持內部辯論，做出最終 team report。

市場背景摘要：
${compactMarketSummary(params.dataPackage)}

4 個 Agent 的分析輸出：
${JSON.stringify(params.agentOutputs, null, 2)}

## 整合框架

**1. 資料品質檢查**
- 哪些 agent 的資料品質有問題？
- 有 missing 或 stale 資料的 agent，其信心分數需相應降低

**2. 多空辯論（Bull vs Bear）**
針對今日最重要的投資決策，列出：
- 多頭論點：支持行動（buy/add）的理由（來自各 agent 的正向訊號）
- 空頭論點：反對行動或支持觀望的理由（來自各 agent 的風險訊號）
- 你作為 leader 的裁決：哪一方論點更有力？為什麼？

**3. Agent 意見調解**
- 如果 4 個 agent 之間有分歧，說明分歧所在
- 你接受哪個 agent 的判斷？為什麼拒絕其他 agent 的觀點？
- 你可以降低某 agent 的信心分數，但必須說明理由

**4. 整合 Recommendations**
將 4 個 agent 的 recommendations 整合為 team-level 建議：
- portfolioReview：每個持股的最終行動建議
- missionAnalysis：今日任務的最終結論
- marketScanRecommendations：最多 3 個 market scan 精選標的
- 每個 recommendation 必須有：reason（整合各 agent 觀點）、buyZone、targetPrice、stopLoss、confidence、keyRisks

**5. 最終市場觀點**
- marketBias：bullish | neutral | bearish（綜合 4 個 agent 的觀點）
- riskLevel：low | medium | high
- mostImportantAction：今日最需要採取的 1 個行動

## 輸出格式

輸出必須是有效 JSON，完全符合以下 schema：
${TEAM_REPORT_JSON_SCHEMA}

重要欄位規則：
- teamName 必須是 "${params.identity.teamName}"
- leader 必須是 "${params.identity.teamLeader}"
- date 必須是 "${params.dataPackage.packageDate}"
- 每個 portfolioReview 項目必須有 stopLoss（不得為空字串或「N/A」若持股資料中有成本）
- marketScanRecommendations 最多 3 個，少於 3 個也可以

規則：
- ${DATA_QUALITY_RULE}
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 7: Update `src/lib/analysis/prompts/division-manager.ts`

Replace the entire file with this:

```typescript
import { DIVISION_DECISION_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
} from "@/lib/analysis/prompts/common";

export function buildDivisionManagerPrompt(params: {
  divisionName: string;
  managerName: string;
  teamReports: unknown[];
  dataPackageSummary?: unknown;
}) {
  return `你是 ${params.managerName}，${params.divisionName} 的 Division Manager。

你負責整合你旗下 5 個 team 的報告，做出 division-level 的最終投資決策。你是這個 division 的最高決策者，可以接受、修改或否決任何 team 的建議。

市場背景摘要：
${JSON.stringify(params.dataPackageSummary ?? {}, null, 2)}

5 個 Team Reports：
${JSON.stringify(params.teamReports, null, 2)}

## 決策框架

**1. Team 一致性評估**
- 有多少個 team 支持積極行動（buy/small_buy/add）？
- 有多少個 team 傾向觀望（wait/watch）或保守（hold/reduce）？
- 最極端的多頭 team 和最保守 team 分別是誰？分歧有多大？

**2. 共識強度判斷**
- 5 個 team 全部同向：高度共識，信心可到 80+
- 3-4 個 team 同向：有共識，信心 60-79
- 2-3 個 team 分歧：低共識，信心上限 60，建議 wait 或 small_buy
- 嚴重分歧（2-2 或更差）：建議 wait，說明分歧原因

**3. 資料品質 Veto**
若多數 team 有 missing 或 stale 資料問題，無論共識如何，信心上限為 60。

**4. 你的 Division 立場**
明確說明：
- 你接受哪些 team 的建議？理由？
- 你否決或降低哪些 team 的建議？理由？
- 最終 decisionAction 是什麼？（必須反映你整合後的判斷，而非直接採用多數決）

**5. Top Recommendations**
從所有 team 的 marketScanRecommendations 中，精選最多 3 個你認為最值得關注的標的，並說明為何選擇它們。

## 輸出格式

輸出必須是有效 JSON，schema 如下：
${DIVISION_DECISION_JSON_SCHEMA}

欄位說明：
- division：必須是 "${params.divisionName}"
- divisionManager：必須是 "${params.managerName}"
- supportingTeams：支持你決策方向的 team 名稱列表
- opposingTeams：與你決策方向相反的 team 名稱列表
- internalDisagreements：描述 team 之間最主要的分歧點（若有）
- decisionAction：你的最終行動建議

規則：
- ${DATA_QUALITY_RULE}
- 你可以 veto 所有 team 並選擇 wait，但必須說明理由
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 8: Update `src/lib/analysis/prompts/committee.ts`

Replace the entire file with this:

```typescript
import { COMMITTEE_DECISION_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
} from "@/lib/analysis/prompts/common";

export function buildCommitteePrompt(params: {
  divisionDecisions: unknown[];
  consensus: {
    consensusLevel: "strong" | "weak" | "none";
    isActionAllowed: boolean;
    averageConfidence: number;
  };
}) {
  return `你是 Cross-Division Investment Committee，投資決策的最高機構。

你負責比較 GPT Division 與 Claude Division 的決策，整合成最終的投資委員會結論。你的決策將直接影響投資組合的操作方向。

兩個 Division 的決策：
${JSON.stringify(params.divisionDecisions, null, 2)}

系統預計算的共識狀態：
${JSON.stringify(params.consensus, null, 2)}

## 委員會審議框架

**1. Division 決策比較**
- GPT Division 的立場：行動類型、信心分數、主要理由
- Claude Division 的立場：行動類型、信心分數、主要理由
- 兩者的核心分歧（若有）：是資料解讀不同？還是風險偏好不同？

**2. 共識裁定**
系統已計算：
- consensusLevel = "${params.consensus.consensusLevel}"（strong：兩者同意且平均信心≥70；weak：兩者同意但信心<70；none：意見相左）
- isActionAllowed = ${params.consensus.isActionAllowed}（只有 strong consensus 才允許採取積極行動）
- averageConfidence = ${params.consensus.averageConfidence}

你必須使用這些系統計算值，不得自行修改 consensusLevel 或 isActionAllowed。

**3. 最終建議整合**
若 isActionAllowed = true：
- 整合兩個 division 的 topRecommendations，選出最終優先推薦的標的
- 確定最終 finalBuyZone、finalTargetPrice、finalStopLoss（取兩個 division 的保守值）
- finalPositionSize：建議部位大小（如「總資金的 5%」或「小倉位試水」）

若 isActionAllowed = false：
- finalAction = "no_action"
- 說明為何不採取行動
- whatCouldChangeDecision：列出哪些條件成立後可重新評估

**4. 風險委員會意見**
- 最保守的 division 是哪個？他們的主要顧慮是什麼？
- 最積極的 division 是哪個？他們的主要論點是什麼？
- 委員會採取哪個 division 的風控立場？

## 輸出格式

輸出必須是有效 JSON，schema 如下：
${COMMITTEE_DECISION_JSON_SCHEMA}

重要：
- consensusLevel 必須等於 "${params.consensus.consensusLevel}"
- isActionAllowed 必須等於 ${params.consensus.isActionAllowed}
- 若 consensusLevel = "none"，agreements 可為空陣列，但 disagreements 必須解釋核心分歧

規則：
- ${DATA_QUALITY_RULE}
- ${JSON_STRICT_RULE}`;
}
```

---

## Verification

After making all edits:

1. Run `npx tsc --noEmit` to confirm no TypeScript errors
2. Check that `compactMarketSummary` is imported in market-review, portfolio-review, mission-analysis, market-scan, and team-leader
3. Check that `dataPackageJson` is NO LONGER used in any of those 5 files (it should only remain exported in common.ts but unused)
4. Confirm `JSON_STRICT_RULE`, `NEWS_SENTIMENT_GUIDE`, `TECHNICAL_ANALYSIS_GUIDE` are exported from common.ts

## Important Notes

- Do NOT change any files in `src/lib/analysis/schemas.ts` — schema definitions and Zod validators stay the same
- Do NOT change any files in `src/lib/analysis/pipeline/` — the pipeline orchestration is separate
- The `dataPackageJson` function stays in common.ts for backward compatibility but should no longer be called from any prompt builder
- The `DailyDataPackage` type fields used in `compactMarketSummary` (portfolio, watchlist, marketSnapshot, dataQualitySummary, packageDate) should already exist — if any field is missing, use optional chaining (`?.`) and default to `"N/A"`
