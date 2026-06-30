# Codex Task: Improve All AI Prompt Files (v2 — Enhanced)

This replaces `codex-prompt-improve-prompts.md`. Apply ALL changes below.

## Research Sources Applied

- **InvestSkill**: Moat analysis, ROIC, Piotroski score, valuation frameworks (prompt-first design)
- **TradingAgents**: Specialized analyst roles, bull/bear debate, multi-agent decision flow
- **FinRobot**: Perception → Brain → Report chain-of-thought, equity research structure
- **Agentic Financial Analyst**: Catalyst identification, DCF context, structured risk/opportunity output
- **PrimoAgent**: Quantified news sentiment scoring (-2 to +2), technical indicator analysis

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

Do NOT touch `src/lib/analysis/schemas.ts`.

---

## Step 1: Replace `src/lib/analysis/prompts/common.ts`

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

// From PrimoAgent: quantified news sentiment scoring
export const NEWS_SENTIMENT_GUIDE = `量化新聞情緒評分（每項 -2 到 +2 分）：
- news_relevance：新聞與該標的的直接相關程度（-2=無關, +2=高度相關）
- sentiment：正面/負面情緒（-2=極度負面, +2=極度正面）
- price_impact_potential：對股價的潛在影響力（-2=重大利空, +2=重大利多）
- trend_direction：新聞是否符合近期趨勢（-2=逆趨勢, +2=順趨勢）
- earnings_impact：對獲利的預期影響（-2=嚴重損害, +2=顯著提升）
- investor_confidence：對投資人信心的影響（-2=打擊信心, +2=大幅提振）
若無新聞資料，請在 dataQualityNotes 說明並跳過評分。`;

// From TradingAgents: technical indicator analysis
export const TECHNICAL_ANALYSIS_GUIDE = `技術面分析重點（若有相關資料）：
- RSI(14)：>70 超買、<30 超賣、50 為多空分界
- MACD：金叉/死叉訊號、柱狀圖縮放方向
- 布林通道：股價相對上/中/下軌位置，突破上軌=強勢/突破下軌=弱勢
- 移動平均線：SMA20/SMA50/SMA200 多空排列（價格在 200 日均線上方=長線多頭）
- ADX：>25 代表有明確趨勢；<20 代表整理震盪
若無法取得技術指標，需在 dataQualityNotes 說明。`;

// From InvestSkill: fundamental quality scoring framework
export const FUNDAMENTAL_QUALITY_GUIDE = `基本面品質評估（使用已知資訊推斷，不得編造數字）：
1. 護城河（Economic Moat）：品牌力、網路效應、成本優勢、轉換成本、規模效應 — 強/中/弱/無法判斷
2. 資本報酬率：ROIC 或 ROE 是否持續 > 15%？是否有惡化趨勢？
3. 盈利品質（Piotroski 概念）：
   - 獲利性：近期是否盈利？現金流是否為正？
   - 槓桿：負債是否增加？流動性是否充足？
   - 效率：毛利率/營業利益率趨勢是否向上？
4. 估值脈絡：相對於歷史 P/E 或同業，目前股價偏貴/合理/便宜？
5. 競爭地位：在同業中排名如何？有無受到新對手威脅？
若資料包中無財務數據，在各項後標注「資料不足，無法評估」。`;

// From Agentic Financial Analyst: structured catalyst framework
export const CATALYST_FRAMEWORK = `催化劑識別（Catalyst Identification）：
- 近期催化劑（1-4 週）：財報、法說會、產品發表、政策、總經數據
- 中期催化劑（1-3 個月）：產業趨勢、訂單能見度、市占變化、匯率
- 長期催化劑（6-12 個月）：技術轉型、新市場、監管環境、資本配置
- 潛在反催化劑（Risk Events）：可能打擊股價的事件或數據
每個催化劑說明：事件名稱、預計時間、對股價的潛在影響（+/−%）、確定性（高/中/低）`;

/**
 * Compact market context for leaf agents — replaces full dataPackageJson.
 * ~60-70% token reduction while preserving all decision-critical data.
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

// Keep for backward compatibility but leaf agents should use compactMarketSummary instead
export function dataPackageJson(dataPackage: DailyDataPackage) {
  return JSON.stringify(dataPackage, null, 2);
}

export function roleLine(identity: PromptIdentity, role: string) {
  return `你是 ${identity.agentName}，${identity.teamName} 的 ${role}。Division：${identity.divisionName}，Division Manager：${identity.divisionManager}。`;
}
```

---

## Step 2: Replace `src/lib/analysis/prompts/market-review.ts`

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

你的專業是宏觀市場分析（對應 TradingAgents 的 Fundamentals + Sentiment Analyst 角色）。你負責評估今日整體市場環境，為 ${identity.teamName} 所有其他 agent 提供市場背景基準。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 分析步驟（Perception → Brain → Report）

**步驟 1：感知市場訊號（Perception）**
讀取所有市場指標，標注哪些資料完整、哪些缺失。

**步驟 2：宏觀環境解讀（Brain）**

A. 恐慌指數解讀
- VIX < 15：市場平靜，適合積極操作
- VIX 15-25：中性波動，需要選股
- VIX 25-35：高度警戒，防守為主
- VIX > 35：恐慌市場，現金為王

B. 利率環境
- 10Y 美債殖利率趨勢：上升壓制高本益比成長股；下降利好防禦型與 REIT
- 殖利率曲線形態（若有資料）

C. 匯率影響
- USD/TWD：強美元（>32）：台股出口商（台積電、聯發科）受益；弱美元：進口商受益
- 美元強弱對美股各板塊的板塊輪動含義

D. 指數相對強弱
- S&P500 vs TAIEX：哪個市場更強？資金是否在轉移？
- 今日漲跌幅與近期趨勢比較

E. 板塊輪動判斷
- 當前環境最有利的 2-3 個板塊（科技/金融/能源/防禦/半導體等）
- 當前環境最不利的 2-3 個板塊

F. 量化市場情緒
${NEWS_SENTIMENT_GUIDE}

G. 市場技術面概況
${TECHNICAL_ANALYSIS_GUIDE}

**步驟 3：對 ${identity.teamName} 的具體含義（Report）**
- 這個市場環境對你的 team 分析方向有什麼影響？
- 今日哪個訊號最重要？為什麼？
- 明確給出 marketBias（bullish/neutral/bearish）與判斷依據

## 輸出格式

${AGENT_OUTPUT_JSON_SCHEMA}

欄位說明：
- summary：2-3 句，必須包含 marketBias 判斷、VIX 水平、最重要的單一訊號
- observations：5-7 項具體觀察，每項必須有數字或事實支撐（例：「VIX=18.5，屬中性區間，較上週下降2點」）
- recommendations：今日市場環境下的操作方向建議
- risks：3-5 項主要下行風險，按嚴重程度排序
- dataQualityNotes：列出所有 missing/stale 資料

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 3: Replace `src/lib/analysis/prompts/portfolio-review.ts`

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  FUNDAMENTAL_QUALITY_GUIDE,
  CATALYST_FRAMEWORK,
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

你的專業是持股管理與風險控制（對應 TradingAgents 的 Risk Manager + Trader 角色）。你對每一個持股做深度評估，給出有明確理由支持的行動建議。

市場背景：
${marketContext}

持股詳細資料：
${portfolioJson}

## 對每一持股依序執行以下分析框架

**階段 1：基本狀況確認**
- 現價 vs 成本：獲利/虧損幅度（%）
- 現價 vs 目標買入價：是否在合理買入區間？
- 現價 vs 停損點：距離停損還有多少空間？

**階段 2：基本面品質評估（InvestSkill 框架）**
${FUNDAMENTAL_QUALITY_GUIDE}

**階段 3：技術面分析**
${TECHNICAL_ANALYSIS_GUIDE}

**階段 4：新聞情緒評分**
${NEWS_SENTIMENT_GUIDE}

**階段 5：催化劑識別**
${CATALYST_FRAMEWORK}

**階段 6：多空辯論（Bull vs Bear Debate）**
多頭論點（至少 2 點，具體事實支撐）：
- 為什麼繼續持有或加碼是正確的？

空頭論點（至少 2 點，不得只寫「市場波動」）：
- 為什麼應該減碼或停損？具體什麼情況會發生？

裁決：哪方論點更有力？為什麼？

**階段 7：行動建議**
- action：buy | add | hold | reduce | sell | watch
- buyZone：建議買入/加碼的具體價格區間
- targetPrice：獲利目標（上檔空間%）
- stopLoss：停損點（必填，具體價格，不得省略）
- whatCouldChangeOurMind：什麼新資訊出現會改變判斷？（至少 2 條）

## 輸出格式

${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 中每個元素：
{ symbol, market, name, action, reason, marketImpact, buyZone, targetPrice, stopLoss, keyRisks, whatCouldChangeOurMind, confidence }

欄位說明：
- summary：今日持股組合整體健康評估
- observations：各持股最關鍵的發現（每持股 1-2 條）
- risks：組合層面的系統性風險

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- stopLoss 必填，必須是具體數字（例：「$145.0」或「成本價下方8%」），不接受「根據個人風險承受能力」
- 不得編造現價、財務比率或分析師目標價；資料不足請在 dataQualityNotes 說明
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 4: Replace `src/lib/analysis/prompts/mission-analysis.ts`

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  CATALYST_FRAMEWORK,
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

你的專業是任務評估與每日優先排序。目前沒有特定任務，你負責執行「每日例行掃描」：找出投資組合與關注清單中今日最需要立即關注的 1-2 件事。

市場資料摘要：
${compactMarketSummary(dataPackage)}

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

**今日最優先任務**
- missionTitle：30 字以內描述今日最重要的分析任務
- suggestion：今日最優先的行動建議（buy/wait/hold/reduce/sell/reject）
- conditionsToAct：什麼條件成立後才採取行動？（至少 2 條具體條件）

## 輸出格式

${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 應包含今日最值得關注的 1-2 個行動項目：
{ symbol, action, reason, priority: "high|medium|low", conditionsToAct }

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
```

---

## Step 5: Replace `src/lib/analysis/prompts/market-scan.ts`

```typescript
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  FUNDAMENTAL_QUALITY_GUIDE,
  CATALYST_FRAMEWORK,
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

你的專業是市場機會發掘（對應 Agentic Financial Analyst 的 Recommendation Engine 角色）。你從關注清單和整體市場中篩選出今日最具投資價值的 1-3 個標的，給出有數據支撐的進場建議。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 篩選流程（Screening Pipeline）

**Step 1：初步篩選**
對每個關注清單標的，確認：
- 資料品質是否 OK（missing 的標的自動排除 buy/small_buy）
- 現價是否在目標買入區間內（targetBuyPrice ± 5%）
- 當前市場環境（VIX、板塊趨勢）是否支持該標的

**Step 2：基本面品質評估（InvestSkill 框架）**
${FUNDAMENTAL_QUALITY_GUIDE}

**Step 3：技術面確認**
${TECHNICAL_ANALYSIS_GUIDE}

**Step 4：新聞情緒評分**
${NEWS_SENTIMENT_GUIDE}

**Step 5：催化劑評估**
${CATALYST_FRAMEWORK}

**Step 6：競爭/板塊脈絡（FinRobot 框架）**
- 該標的在其所屬板塊中排名如何？（龍頭/跟隨者/落後者）
- 相較同業，估值是偏高/合理/偏低？
- 板塊整體趨勢是否有利？

**Step 7：綜合評分（0-100）**
- 價格位置分（0-25）：現價是否在目標買入區間？
- 市場環境分（0-25）：VIX + 板塊趨勢是否有利？
- 技術面分（0-25）：技術指標有無明確買入訊號？
- 基本面/新聞分（0-25）：品質評估 + 情緒評分加總

只有綜合評分 ≥ 60 的標的才能進入最終推薦。

**Step 8：風險環境調整**
- VIX > 25（高恐慌）：最多推薦 1 個，傾向 watch
- VIX 15-25（中性）：最多推薦 2 個
- VIX < 15（低波動）：最多推薦 3 個
- 若無符合條件的標的，recommendations 為空陣列，summary 說明原因

## 輸出格式

${AGENT_OUTPUT_JSON_SCHEMA}

recommendations 每個元素：
{ symbol, market, name, reason, buyZone, targetPrice, stopLoss, timeHorizon, confidence, keyRisks, compositeScore, catalystSummary }

欄位說明：
- summary：今日掃描結論，說明篩選了幾個候選、通過幾個
- observations：篩選過程的關鍵發現（包括被排除的候選及排除原因）
- risks：推薦標的的共同市場風險

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- 每個推薦必須有具體的 buyZone、targetPrice、stopLoss，不接受「依個人評估」
- compositeScore 必須填入你計算的 0-100 評分
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 6: Replace `src/lib/analysis/prompts/team-leader.ts`

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

你是 ${params.identity.teamName} 的決策核心（對應 TradingAgents 的 Portfolio Manager + Trader 角色）。你整合 4 個 agent 的分析，主持內部辯論，輸出最終 team report。

市場背景摘要：
${compactMarketSummary(params.dataPackage)}

4 個 Agent 的輸出（Market Review / Portfolio Review / Mission Analysis / Market Scan）：
${JSON.stringify(params.agentOutputs, null, 2)}

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
- 4 個 agent 之間最主要的分歧是什麼？
- 你如何解決這個分歧？（採用哪個 agent 的判斷，理由是什麼）

**Phase 4：整合 Recommendations**

portfolioReview：
- 整合 Portfolio Review agent 的輸出，每個持股給出最終行動建議
- 必須包含 stopLoss（若持股資料有成本價則必填）

missionAnalysis：
- 整合 Mission Analysis agent 的每日掃描結論
- missionTitle 描述今日最重要任務

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
```

---

## Step 7: Replace `src/lib/analysis/prompts/division-manager.ts`

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

你是這個 division 的最高決策者，整合旗下 5 個 team 的報告，做出 division-level 最終投資決策。你有完全的權力接受、修改或否決任何 team 的建議。

市場背景摘要：
${JSON.stringify(params.dataPackageSummary ?? {}, null, 2)}

5 個 Team Reports：
${JSON.stringify(params.teamReports, null, 2)}

## Division 決策框架（FinRobot Equity Research Flow）

**Phase 1：Team 一致性評估**

統計今日 5 個 team 的立場分布：
- 積極方向（buy/small_buy/add）：X 個 team
- 中性方向（hold/watch/wait）：X 個 team  
- 保守方向（reduce/sell/avoid）：X 個 team

共識強度判斷：
- 4-5 個 team 同向 → 高度共識，信心可到 75-90
- 3 個 team 同向 → 中等共識，信心 55-74
- 2 個 team 同向 → 低共識，信心上限 60，建議保守
- 嚴重分歧 → 信心上限 50，建議 wait

**Phase 2：質量加權（非多數決）**

不同的 team 有不同的可信度，根據今日資料品質加權：
- 資料品質良好的 team：全權重
- 資料有 stale 問題的 team：0.7 權重
- 資料有 missing 問題的 team：0.4 權重

說明：你最終倚重的是哪 2-3 個 team？為什麼？

**Phase 3：Decision 理由陳述**

支持你 decisionAction 的理由（supportingReasons，至少 3 條）：
每條必須引用具體 team 的具體觀察。

反對你 decisionAction 的理由（opposingReasons，至少 2 條）：
承認有哪些 team 不同意，他們的顧慮是什麼。

**Phase 4：Veto 或確認**

你可以行使 veto 並選擇 wait，即使多數 team 支持積極行動。
Veto 條件：
- 多數 team 資料品質有重大問題
- 外部環境（VIX > 30）不支持積極操作
- Team 之間的分歧太大，無法形成有效共識

若行使 veto，在 internalDisagreements 中說明 veto 理由。

**Phase 5：Top Recommendations 精選**

從所有 team 的 marketScanRecommendations 中，精選最多 3 個：
- 優先選擇被多個 team 同時提到的標的
- 優先選擇有具體 buyZone 和 stopLoss 的標的
- 說明為何選擇這 3 個而不是其他

## 輸出格式

${DIVISION_DECISION_JSON_SCHEMA}

強制欄位：
- division = "${params.divisionName}"
- divisionManager = "${params.managerName}"
- supportingTeams：支持你決策方向的 team 名稱列表（從 5 個 team 中選）
- opposingTeams：與你決策方向相反的 team 名稱列表
- internalDisagreements：描述最主要的 1-2 個內部分歧點（若無分歧則說明）

規則：
- ${DATA_QUALITY_RULE}
- 你可以 veto 所有 team 並選擇 wait，但必須在 internalDisagreements 中說明理由
- ${JSON_STRICT_RULE}`;
}
```

---

## Step 8: Replace `src/lib/analysis/prompts/committee.ts`

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
  return `你是 Cross-Division Investment Committee，本系統的最高投資決策機構。

你的任務：比較 GPT Division 與 Claude Division 的決策，整合成最終委員會結論，決定是否採取行動及行動規模。

兩個 Division 的決策：
${JSON.stringify(params.divisionDecisions, null, 2)}

系統預計算的共識狀態：
- consensusLevel：${params.consensus.consensusLevel}
- isActionAllowed：${params.consensus.isActionAllowed}
- averageConfidence：${params.consensus.averageConfidence}

## 委員會審議流程

**議程 1：Division 立場比較**

GPT Division 立場：
- decisionAction：[從 divisionDecisions 中讀取]
- 核心理由：[summarize]
- 信心分數：[從 divisionDecisions 中讀取]
- 最保守/最積極的 team 是哪個？

Claude Division 立場：
- decisionAction：[從 divisionDecisions 中讀取]
- 核心理由：[summarize]
- 信心分數：[從 divisionDecisions 中讀取]
- 最保守/最積極的 team 是哪個？

**議程 2：共識裁定**

系統已計算共識結果，你必須使用這些值：
- consensusLevel 必須等於 "${params.consensus.consensusLevel}"
- isActionAllowed 必須等於 ${params.consensus.isActionAllowed}

共識含義：
- strong（兩者同意 + 平均信心 ≥ 70）→ 允許積極行動
- weak（兩者同意但信心 < 70）→ 只允許小倉位或觀望
- none（兩者不同意）→ 不採取新行動，等待更多確認

**議程 3：最終建議整合**

若 isActionAllowed = true：
整合兩個 division 的 topRecommendations：
- 取兩個 division 都認可的標的（若有）為第一優先
- finalBuyZone：取兩個 division 建議中較保守的那個
- finalTargetPrice：取兩個 division 目標的平均或較保守值
- finalStopLoss：取兩個 division 中停損較緊（較高）的那個（風控優先）
- finalPositionSize：建議部位規模（例：「總資金 5%」、「小試水溫 3%」）

若 isActionAllowed = false：
- finalAction = "no_action"
- reason 說明為何不採取行動
- whatCouldChangeDecision：至少 3 條具體條件，說明什麼情況下可以重新評估

**議程 4：風險委員會意見**
- mostConservativeDivision：哪個 division 更保守？他們最主要的顧慮是什麼？
- mostAggressiveDivision：哪個 division 更積極？他們最有力的論點是什麼？
- 委員會最終採取哪個 division 的風控標準？

## 輸出格式

${COMMITTEE_DECISION_JSON_SCHEMA}

強制規則：
- consensusLevel 必須等於 "${params.consensus.consensusLevel}"（不得修改）
- isActionAllowed 必須等於 ${params.consensus.isActionAllowed}（不得修改）
- 若 consensusLevel = "none"：agreements 可為空，disagreements 必須解釋核心分歧
- whatCouldChangeDecision 至少 3 條

規則：
- ${DATA_QUALITY_RULE}
- ${JSON_STRICT_RULE}`;
}
```

---

## Verification Checklist

After making ALL edits, run:

```bash
npx tsc --noEmit
```

Confirm:
1. Zero TypeScript errors
2. `compactMarketSummary` is imported in: market-review, portfolio-review, mission-analysis, market-scan, team-leader
3. `dataPackageJson` is NOT called from any of those 5 files
4. `FUNDAMENTAL_QUALITY_GUIDE` and `CATALYST_FRAMEWORK` are imported in: portfolio-review, mission-analysis, market-scan
5. `NEWS_SENTIMENT_GUIDE` and `TECHNICAL_ANALYSIS_GUIDE` are imported in: market-review, portfolio-review, market-scan
6. `JSON_STRICT_RULE` is imported in all 7 prompt builder files

If TypeScript errors appear on `compositeScore` or `catalystSummary` in market-scan recommendations (these are new fields not in the Zod schema), wrap them in the flexible `recommendations` array which accepts `FlexibleRecordSchema` — no schema change needed.
