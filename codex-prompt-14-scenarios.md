# Codex Prompt 14 — Bull / Bear / Base Scenario Analysis (多空雙向情境分析)

**Goal**: Force every agent to think in THREE directions simultaneously — bull case, bear case, and base case — for each holding and recommendation. Currently agents only output a single action with one target price. This is the single biggest gap in analysis quality.

**Apply after**: Prompts 01–13 applied.

---

## Background

Professional trading desks always structure analysis as three scenarios:

| 情境 | 內容 |
|------|------|
| **做多劇本 Bull** | 什麼條件觸發上漲？目標在哪？機率多少？ |
| **做空劇本 Bear** | 什麼條件觸發下跌？跌到哪？機率多少？ |
| **盤整劇本 Base** | 最可能的中性情況是什麼？ |

這三個合計機率 = 100%，讓投資人知道進場前面對的是什麼局面。

---

## Step 1: Add `ScenarioSchema` to `src/lib/analysis/schemas.ts`

Add these schemas BEFORE the existing `PortfolioReviewItemSchema`:

```typescript
export const ScenarioSchema = z.object({
  trigger: z.string(),          // 觸發此情境的條件（例如「突破 $165 壓力 + 放量」）
  target: z.string(),           // 目標價位或區間（例如「$185–195」）
  probability: z.number().min(0).max(100), // 機率（0-100，三個加總應為 100）
  timeframe: z.string(),        // 預估時間（例如「4-8 週」）
  action: z.string(),           // 建議行動（例如「突破後追買」「跌破支撐減倉」）
});

export const ScenariosSchema = z.object({
  bull: ScenarioSchema,
  bear: ScenarioSchema,
  base: ScenarioSchema,
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type Scenarios = z.infer<typeof ScenariosSchema>;
```

---

## Step 2: Add `scenarios` to existing schemas

### 2a. Add to `PortfolioReviewItemSchema`

```typescript
export const PortfolioReviewItemSchema = z.object({
  symbol: z.string(),
  market: z.enum(["US", "TW"]),
  name: z.string(),
  action: z.enum(["buy", "add", "hold", "reduce", "sell", "watch"]),
  reason: z.string(),
  marketImpact: z.string(),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  keyRisks: z.array(z.string()),
  whatCouldChangeOurMind: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  scenarios: ScenariosSchema.optional(), // ADD THIS
});
```

### 2b. Add to `MissionAnalysisSchema`

```typescript
export const MissionAnalysisSchema = z.object({
  missionTitle: z.string(),
  missionType: z.string(),
  relatedSymbols: z.array(z.string()),
  summary: z.string(),
  suggestion: z.enum(["buy", "wait", "reject", "hold", "reduce", "sell"]),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  reason: z.string(),
  keyRisks: z.array(z.string()),
  conditionsToAct: z.array(z.string()),
  scenarios: ScenariosSchema.optional(), // ADD THIS
});
```

### 2c. Add to `MarketScanRecommendationSchema`

```typescript
export const MarketScanRecommendationSchema = z.object({
  symbol: z.string(),
  market: z.enum(["US", "TW"]),
  name: z.string(),
  reason: z.string(),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  keyRisks: z.array(z.string()),
  scenarios: ScenariosSchema.optional(), // ADD THIS
});
```

---

## Step 3: Update JSON schema strings in `schemas.ts`

### 3a. Update `TEAM_REPORT_JSON_SCHEMA`

In the `portfolioReview` array item, add after `whatCouldChangeOurMind`:

```json
"scenarios": {
  "bull": {
    "trigger": "突破 $165 壓力位 + 成交量放大",
    "target": "$185–195",
    "probability": 35,
    "timeframe": "4–8 週",
    "action": "突破確認後追買，目標減半倉位"
  },
  "bear": {
    "trigger": "跌破 $147 支撐位",
    "target": "$125–130",
    "probability": 40,
    "timeframe": "2–4 週",
    "action": "跌破立即減倉至 30%"
  },
  "base": {
    "trigger": "維持 $147–165 區間整理",
    "target": "無明確方向",
    "probability": 25,
    "timeframe": "2–3 週",
    "action": "持倉觀望，等待方向確認"
  }
}
```

In the `missionAnalysis` object, add the same `scenarios` field after `conditionsToAct`.

In the `marketScanRecommendations` array item, add the same `scenarios` field after `keyRisks`.

### 3b. Update `DIVISION_DECISION_JSON_SCHEMA`

Inside `missionDecision`, add after `conditionsToAct`:

```json
"scenarios": {
  "bull": {
    "trigger": "觸發做多的條件",
    "target": "做多目標價",
    "probability": 35,
    "timeframe": "預估時間",
    "action": "做多時的建議行動"
  },
  "bear": {
    "trigger": "觸發做空/防禦的條件",
    "target": "做空目標或防禦水位",
    "probability": 40,
    "timeframe": "預估時間",
    "action": "做空/防禦時的建議行動"
  },
  "base": {
    "trigger": "盤整/無方向的條件",
    "target": "整理區間",
    "probability": 25,
    "timeframe": "預估時間",
    "action": "盤整時的建議行動"
  }
}
```

### 3c. Update `COMMITTEE_DECISION_JSON_SCHEMA`

Add after `finalStopLoss`:

```json
"finalScenarios": {
  "bull": {
    "trigger": "兩個 Division 共識的做多觸發條件",
    "target": "委員會整合目標價",
    "probability": 0,
    "timeframe": "預估時間",
    "action": "做多時建議行動"
  },
  "bear": {
    "trigger": "兩個 Division 共識的做空/防禦觸發條件",
    "target": "委員會整合下方目標",
    "probability": 0,
    "timeframe": "預估時間",
    "action": "做空/防禦時建議行動"
  },
  "base": {
    "trigger": "盤整情況",
    "target": "整理區間",
    "probability": 0,
    "timeframe": "預估時間",
    "action": "盤整時建議行動"
  }
}
```

Also add `finalScenarios: ScenariosSchema.optional()` to `CommitteeDecisionSchema`.

---

## Step 4: Add `SCENARIO_ANALYSIS_GUIDE` to `src/lib/analysis/prompts/common.ts`

```typescript
export const SCENARIO_ANALYSIS_GUIDE = `## 多空情境分析（必填，每個持股/建議都需要）

對每個你分析的標的，必須同時給出三個情境。三個情境的機率合計必須等於 100。

**做多劇本 (bull)**
- trigger：什麼技術面或基本面訊號確認看多？（例如：「突破 $X 壓力 + 週成交量 > 均量 150%」）
- target：做多目標價位或區間
- probability：bull case 發生機率（0-100）
- timeframe：達到目標預估時間
- action：bull case 成立時你的建議操作

**做空/防禦劇本 (bear)**
- trigger：什麼訊號確認看空或需要防禦？（例如：「跌破 $X 支撐 + 連續 2 日收黑」）
- target：下方支撐或目標（ETF 請標示預期跌幅）
- probability：bear case 發生機率（0-100）
- timeframe：預估時間
- action：bear case 成立時你的建議操作（停損/減倉幅度）

**盤整劇本 (base)**
- trigger：什麼情況代表沒有明確方向？（例如：「維持 $X–$Y 區間，成交量萎縮」）
- target：整理區間描述
- probability：base case 發生機率（0-100）
- timeframe：預估持續時間
- action：盤整時的建議（通常是持倉觀望或小幅減少暴露）

**重要規則**：
- bull + bear + base 的 probability 合計必須 = 100
- trigger 必須是具體的、可觀察的條件，不能是模糊的描述
- 若資料不足以判斷具體價位，用百分比描述（「上漲 15%」「跌破近期低點 -8%」）
- ETF 不適用個股目標價邏輯，改用基準指數比較（「跑贏 SPY 5%」）`;
```

---

## Step 5: Inject `SCENARIO_ANALYSIS_GUIDE` into agent prompts

### 5a. `src/lib/analysis/prompts/portfolio-review.ts`

Add import:
```typescript
import { SCENARIO_ANALYSIS_GUIDE } from "@/lib/analysis/prompts/common";
```

In `buildPortfolioReviewPrompt`, after the existing analysis frameworks and before the output schema section, add:

```typescript
${SCENARIO_ANALYSIS_GUIDE}
```

### 5b. `src/lib/analysis/prompts/mission-analysis.ts`

Same pattern — add `SCENARIO_ANALYSIS_GUIDE` import and inject before output schema.

### 5c. `src/lib/analysis/prompts/market-scan.ts`

Same pattern — inject `SCENARIO_ANALYSIS_GUIDE` for watchlist scan items.

### 5d. `src/lib/analysis/prompts/division-manager.ts`

Add to the Phase 6 missionDecision synthesis section:

```typescript
在 missionDecision.scenarios 中整合各 team 的多空情境：
- bull.probability：取各 team bull 機率的加權平均
- bear.probability：取各 team bear 機率的加權平均
- base.probability：100 - bull - bear
- trigger 和 target：取各 team 中出現最多次的共識觸發條件和目標價
```

### 5e. `src/lib/analysis/prompts/committee.ts`

Add to the integration section:

```typescript
**情境整合（finalScenarios）**
整合兩個 Division 的 scenarios：
- 若兩個 Division 的 bull trigger 相似，取共識描述
- 若兩個 Division 的機率差距 > 20%，取保守值（較低的 bull 機率，較高的 bear 機率）
- finalScenarios.bull + bear + base probability 合計必須 = 100
```

---

## Step 6: Update UI to display scenarios

### 6a. `src/app/missions/[id]/page.tsx`

In the **模型分析對照** section, add a scenarios row. Find the division map and add:

```tsx
{divisions.map((division) => {
  const missionDecision = asRecord(division.mission_decision);
  const scenarios = asRecord(missionDecision.scenarios);
  const bull = asRecord(scenarios.bull);
  const bear = asRecord(scenarios.bear);
  const base = asRecord(scenarios.base);

  return (
    <>
      {/* Existing row */}
      <tr key={`analysis-${String(division.id)}`}>
        {/* ... existing cells ... */}
      </tr>

      {/* ADD: Scenarios row */}
      {(bull.trigger || bear.trigger) && (
        <tr key={`scenarios-${String(division.id)}`} className="bg-slate-50">
          <Td colSpan={2} className="text-xs font-medium text-slate-500">
            {String(division.division ?? "—")} 情境
          </Td>
          <Td colSpan={2}>
            <div className="space-y-1 text-xs">
              <div className="text-green-700">
                🟢 做多（{String(bull.probability ?? "?")}%）：{String(bull.trigger ?? "—")} → {String(bull.target ?? "—")}
              </div>
              <div className="text-red-700">
                🔴 做空（{String(bear.probability ?? "?")}%）：{String(bear.trigger ?? "—")} → {String(bear.target ?? "—")}
              </div>
              <div className="text-slate-600">
                ⚪ 盤整（{String(base.probability ?? "?")}%）：{String(base.trigger ?? "—")}
              </div>
            </div>
          </Td>
          <Td colSpan={3} />
        </tr>
      )}
    </>
  );
})}
```

### 6b. Add scenarios to committee section

In the 委員會決策 section, display `finalScenarios` if available:

```tsx
{/* After existing committee fields */}
{(() => {
  const committeeRecord = asRecord(committee);
  const finalScenarios = asRecord(committeeRecord?.final_scenarios ?? committeeRecord?.finalScenarios);
  const bull = asRecord(finalScenarios.bull);
  const bear = asRecord(finalScenarios.bear);
  const base = asRecord(finalScenarios.base);

  if (!bull.trigger && !bear.trigger) return null;

  return (
    <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-4">
      <p className="mb-2 text-sm font-semibold text-slate-700">委員會情境評估</p>
      <div className="space-y-2 text-sm">
        <div className="flex gap-3">
          <span className="w-6 flex-shrink-0">🟢</span>
          <div>
            <span className="font-medium text-green-700">做多 {String(bull.probability ?? "?")}%</span>
            <span className="ml-2 text-slate-600">{String(bull.trigger ?? "—")} → 目標 {String(bull.target ?? "—")}</span>
            <span className="ml-2 text-slate-500 text-xs">{String(bull.action ?? "")}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="w-6 flex-shrink-0">🔴</span>
          <div>
            <span className="font-medium text-red-700">做空/防禦 {String(bear.probability ?? "?")}%</span>
            <span className="ml-2 text-slate-600">{String(bear.trigger ?? "—")} → {String(bear.target ?? "—")}</span>
            <span className="ml-2 text-slate-500 text-xs">{String(bear.action ?? "")}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="w-6 flex-shrink-0">⚪</span>
          <div>
            <span className="font-medium text-slate-600">盤整 {String(base.probability ?? "?")}%</span>
            <span className="ml-2 text-slate-600">{String(base.trigger ?? "—")}</span>
          </div>
        </div>
      </div>
    </div>
  );
})()}
```

---

## Verification

After applying:

1. `npx tsc --noEmit` — no errors
2. Run a mission
3. Check `team_reports` in Supabase — `portfolio_review` JSON should contain `scenarios` with bull/bear/base for each holding
4. Check `division_decisions` — `mission_decision` JSON should contain `scenarios`
5. Check UI — 模型分析對照 section should show green/red/grey scenario rows below each division

Expected output for SPCX after this prompt:

```
🟢 做多（35%）：突破 $165 壓力 + 成交量確認 → $185–195（財報後加碼）
🔴 做空/防禦（45%）：跌破 $147 或鎖定期解禁賣壓 → $125–130（立即減倉 50%）
⚪ 盤整（20%）：維持 $147–165 財報前整理（持倉觀望等 8 月 6 日）
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/schemas.ts` | Add `ScenarioSchema` + `ScenariosSchema`, add `scenarios?` to `PortfolioReviewItemSchema`, `MissionAnalysisSchema`, `MarketScanRecommendationSchema`, `CommitteeDecisionSchema`. Update all 4 JSON schema strings. |
| `src/lib/analysis/prompts/common.ts` | Add `SCENARIO_ANALYSIS_GUIDE` constant |
| `src/lib/analysis/prompts/portfolio-review.ts` | Inject `SCENARIO_ANALYSIS_GUIDE` |
| `src/lib/analysis/prompts/mission-analysis.ts` | Inject `SCENARIO_ANALYSIS_GUIDE` |
| `src/lib/analysis/prompts/market-scan.ts` | Inject `SCENARIO_ANALYSIS_GUIDE` |
| `src/lib/analysis/prompts/division-manager.ts` | Add scenario synthesis instructions to Phase 6 |
| `src/lib/analysis/prompts/committee.ts` | Add `finalScenarios` synthesis instructions |
| `src/app/missions/[id]/page.tsx` | Display bull/bear/base scenarios in 模型分析對照 and 委員會決策 sections |
