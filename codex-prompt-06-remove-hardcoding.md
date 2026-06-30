# Codex Task: Remove Hardcoded Rules — Let AI Make the Decisions

## The Core Problem

Two types of hardcoding exist in this system:

**Type A — Code making decisions AI should make** (must fix):
- `committee.ts` pipeline: `computeConsensus()` decides `consensusLevel` and `isActionAllowed` with if/else, then overwrites the AI's output. The AI committee is just writing a report whose conclusions are ignored.

**Type B — Prompts giving AI rigid rules instead of judgment guidelines** (must fix):
- Division manager told "4-5 teams same = confidence 75-90" — AI should derive its own confidence
- Market scan told "VIX > 25 = max 1 recommendation" — AI should decide based on full context
- Market review told "VIX < 15 = bullish, VIX > 35 = cash only" as absolute rules
- Committee prompt told "strong = both agree + confidence ≥ 70" — then AI must repeat this back

**What should stay as code (safety gates)**:
- If `consensusLevel = "none"`, enforce `isActionAllowed = false` as a safety override
- Requiring both divisions to complete before committee runs
- These are risk controls, not analysis decisions

---

## Fix 1: Remove `computeConsensus` from `src/lib/analysis/pipeline/committee.ts`

### 1a. Delete the `computeConsensus` function entirely (lines 26-54)

### 1b. In `runCommitteePipeline`, remove the `consensus` variable and pass division decisions directly

Change:
```typescript
  const consensus = computeConsensus(completed);
  const model = await getCommitteeModelProvider(completed[0].decision.division);
  const prompt = buildCommitteePrompt({
    divisionDecisions: completed.map((result) => result.decision),
    consensus
  });
```

To:
```typescript
  const model = await getCommitteeModelProvider(completed[0].decision.division);
  const prompt = buildCommitteePrompt({
    divisionDecisions: completed.map((result) => result.decision),
  });
```

### 1c. Update `buildCommitteePrompt` call signature in `src/lib/analysis/prompts/committee.ts`

Remove the `consensus` parameter from the function signature:

```typescript
export function buildCommitteePrompt(params: {
  divisionDecisions: unknown[];
}) {
```

### 1d. After AI output, add a safety gate that enforces the only non-negotiable rule

In `runCommitteePipeline`, after `const decision: CommitteeDecision = validation.parsed`, add:

```typescript
    // Safety gate: if AI determined no consensus, force isActionAllowed = false
    // This is a risk control override, not an analysis decision
    const safeguardedDecision: CommitteeDecision = {
      ...decision,
      isActionAllowed: decision.consensusLevel === "strong" ? decision.isActionAllowed : false,
    };
```

Then use `safeguardedDecision` everywhere `decision` was used after this point (saving to DB, returning result).

### 1e. Also update the `weighted_confidence` saved to DB

Since we no longer compute `consensus.averageConfidence`, compute it from the completed division results:

```typescript
    const averageConfidence = completed.reduce((sum, r) => sum + r.decision.confidence, 0) / completed.length;
```

Use `averageConfidence` for `weighted_confidence` in the DB insert.

---

## Fix 2: Rewrite `src/lib/analysis/prompts/committee.ts`

Remove all references to pre-computed consensus values. Let the AI assess consensus itself.

Replace the entire file with:

```typescript
import { COMMITTEE_DECISION_JSON_SCHEMA } from "@/lib/analysis/schemas";
import { DATA_QUALITY_RULE, JSON_STRICT_RULE } from "@/lib/analysis/prompts/common";

export function buildCommitteePrompt(params: {
  divisionDecisions: unknown[];
}) {
  return `你是 Cross-Division Investment Committee，本系統的最高投資決策機構。

你負責獨立評估 GPT Division 與 Claude Division 的決策，做出最終委員會結論。

兩個 Division 的完整決策：
${JSON.stringify(params.divisionDecisions, null, 2)}

## 你的任務

**1. 評估兩個 Division 的立場**

閱讀兩個 division 的 decisionAction、confidence、supportingReasons、opposingReasons。

**2. 自主判斷共識程度**

根據你的分析，決定 consensusLevel：
- "strong"：兩個 division 的行動方向實質相同（例如都傾向買進或都傾向觀望），且兩者的理由有高度重疊，信心均屬合理水平。Strong consensus 代表你允許採取行動（isActionAllowed = true）。
- "weak"：方向相近但存在明顯分歧，或其中一方信心明顯偏低。Weak consensus 代表謹慎，isActionAllowed = false。
- "none"：兩個 division 的行動方向實質相反（例如一個建議 buy，另一個建議 sell/reduce）。None 代表不採取行動，isActionAllowed = false。

重要：「實質相同」不等於字串完全一致。"hold" 和 "small_buy" 可能是 weak consensus；"buy" 和 "sell" 是 none。你用判斷力決定，不是字串比對。

**3. 整合最終建議**

若 isActionAllowed = true：
- 整合兩個 division 的 topRecommendations
- finalBuyZone、finalTargetPrice：取兩者的合理中間值或較保守值
- finalStopLoss：取較緊的停損（風控優先）
- finalPositionSize：根據共識強度決定部位規模

若 isActionAllowed = false：
- finalAction = "no_action"
- whatCouldChangeDecision：列出具體條件讓決策可以改變

**4. 風險委員會意見**
- mostConservativeDivision：哪個 division 更保守？為什麼？
- mostAggressiveDivision：哪個 division 更積極？為什麼？

## 輸出格式

${COMMITTEE_DECISION_JSON_SCHEMA}

規則：
- ${DATA_QUALITY_RULE}
- isActionAllowed 只有在 consensusLevel = "strong" 時才能為 true
- whatCouldChangeDecision 至少 3 條
- ${JSON_STRICT_RULE}`;
}
```

---

## Fix 3: Rewrite `division-manager.ts` prompt — remove rigid confidence formulas

In `src/lib/analysis/prompts/division-manager.ts`, replace the **Phase 1 共識強度判斷** and **Phase 2 質量加權** sections with judgment-based guidance.

Replace this block:
```
共識強度判斷：
- 4-5 個 team 同向 → 高度共識，信心可到 75-90
- 3 個 team 同向 → 中等共識，信心 55-74
- 2 個 team 同向 → 低共識，信心上限 60，建議保守
- 嚴重分歧 → 信心上限 50，建議 wait
```

With:
```
共識強度判斷（你的判斷，不是公式）：
統計各方向的 team 數量後，評估共識的強度。考慮：
- 同向 team 的數量
- 每個 team 自己的信心分數
- 異見 team 的論點是否具有重大說服力（一個強論點可能勝過多個弱論點）
- 今日資料品質整體是否可信
根據這些因素，自主決定你的 confidence（0-100）。不要按公式套數字。
```

Replace this block:
```
不同的 team 有不同的可信度，根據今日資料品質加權：
- 資料品質良好的 team：全權重
- 資料有 stale 問題的 team：0.7 權重
- 資料有 missing 問題的 team：0.4 權重
```

With:
```
不同的 team 有不同的可信度。資料有 missing 問題的 team 的建議可信度較低，有 stale 問題的次之，資料完整的 team 最可信。但這是你的判斷，不是固定公式——有時一個資料完整但分析薄弱的 team 不如一個資料稍舊但論點紮實的 team。說明你最倚重哪 2-3 個 team 及原因。
```

Replace the Veto 條件:
```
Veto 條件：
- 多數 team 資料品質有重大問題
- 外部環境（VIX > 30）不支持積極操作
- Team 之間的分歧太大，無法形成有效共識
```

With:
```
你有權行使 veto。合理的 veto 理由包括但不限於：
- 資料品質整體太差，無法支持有信心的決策
- 市場環境表現出異常風險（不限於特定 VIX 數字，你判斷）
- Team 之間的分歧太根本，強行整合反而危險
若行使 veto，必須在 internalDisagreements 中清楚說明為什麼多數意見仍不足以採納。
```

---

## Fix 4: Update `market-scan.ts` — remove VIX count rules and score threshold

In `src/lib/analysis/prompts/market-scan.ts`, replace **Step 7 and Step 8** with:

```
**Step 7：綜合評分（0-100）**
- 價格位置分（0-25）：現價是否在目標買入區間？
- 市場環境分（0-25）：當前 VIX、趨勢、板塊環境是否有利？
- 技術面分（0-25）：技術指標有無明確訊號？
- 基本面/新聞分（0-25）：品質評估 + 情緒評分

**Step 8：最終篩選**
根據你的綜合評分和今日市場環境，決定推薦幾個標的（0-3 個）及推薦強度。
考量因素：市場整體風險水平、每個候選的評分、你對今日操作信心。
若市場風險高，你可以選擇推薦 0 個並說明原因。
若市場平靜且有明確機會，最多推薦 3 個。
由你判斷——不要按 VIX 數字自動計算推薦數量。
```

---

## Fix 5: Update `market-review.ts` — change absolute rules to reference context

In `src/lib/analysis/prompts/market-review.ts`, change the **A. 恐慌指數解讀** section from absolute rules to reference context:

Replace:
```
A. 恐慌指數解讀
- VIX < 15：市場平靜，適合積極操作
- VIX 15-25：中性波動，需要選股
- VIX 25-35：高度警戒，防守為主
- VIX > 35：恐慌市場，現金為王
```

With:
```
A. 恐慌指數解讀
VIX 歷史參考區間：通常 < 15 代表低波動環境，15-25 屬正常範圍，25 以上代表市場出現明顯不安，35 以上代表恐慌狀態。
但這只是歷史參考——請結合趨勢（VIX 是升還是降？）、持續時間、以及其他指標共同判斷今日市場情緒。
給出你對當前 VIX 的解讀，以及為什麼你這樣判斷。
```

Change the **C. 匯率影響** USD/TWD reference:

Replace:
```
- USD/TWD：強美元（>32）：台股出口商（台積電、聯發科）受益；弱美元：進口商受益
```

With:
```
- USD/TWD：說明目前匯率水平對台股出口商和進口商各自的含義，以及與近期趨勢的比較。不要套用固定匯率門檻做結論。
```

---

## Verification

Run `npx tsc --noEmit`.

Key TypeScript change: `buildCommitteePrompt` no longer accepts a `consensus` parameter. The call in `committee.ts` pipeline must be updated to remove that argument. The type in `committee.ts` pipeline for `DivisionPipelineResult` doesn't change.

After applying, run a test mission. The key difference you should see:
- Committee now independently determines whether GPT Division and Claude Division are aligned, based on reading their actual reasoning — not just comparing action strings
- "hold" + "small_buy" might now produce "weak" consensus instead of "none"
- Division manager derives its own confidence instead of following a formula
- Market scan recommendations are based on AI judgment of opportunity quality, not automatic VIX thresholds
