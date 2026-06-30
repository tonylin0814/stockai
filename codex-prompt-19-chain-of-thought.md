# Codex Prompt 19 — Chain-of-Thought Reasoning Scratchpad

**Goal**: Force every leaf agent to write a numbered reasoning scratchpad BEFORE outputting JSON. This is the single highest-impact quality improvement — models reason significantly better when they must show their work first, and it prevents the agent from outputting plausible-sounding conclusions that aren't grounded in the actual data provided.

**Apply after**: Prompts 01–18 applied.

**Key insight**: The agents currently go data → JSON in one step. Adding a "think out loud" block before the JSON forces the model to cite actual numbers, identify its own weaknesses, and calibrate confidence — before committing to a conclusion.

---

## Step 1: Add `REASONING_SCRATCHPAD_RULE` to `src/lib/analysis/prompts/common.ts`

Add this constant after `JSON_STRICT_RULE`:

```typescript
export const REASONING_SCRATCHPAD_RULE = `## 必要推理步驟（先寫推理，後寫 JSON）

在輸出 JSON 之前，你必須先完成以下推理步驟。用純文字寫，不要 JSON 格式。

**步驟 A：資料點引用（Data Citation）**
列出你從資料包中實際讀到的 3–5 個具體數字或事實，每條用「→」標示其對分析的含義：
例：
- 現價 159.81，較52週高 165.20 下跌 3.3% → 接近高點但有小幅回撤，短期壓力存在
- RSI(14) = 62，布林通道位置 near_upper → 偏強但非超買，尚有上漲空間
- 無財報日資料 → 無近期財報風險，可正常操作
（如果某項資料在資料包中為 missing 或 不足，你必須明確寫出「[資料缺失] xxx 無資料」）

**步驟 B：最強反方論點（Devil's Argument）**
寫出一個你最難反駁的反方觀點。必須具體，不得只寫「市場有風險」。
例：「若美聯儲在下次會議升息，高 P/E 成長股可能面臨估值重評，SPCX 目前 P/E 無資料，風險難以量化。」

**步驟 C：信心度自評（Confidence Calibration）**
根據以下規則自評信心上限，然後決定你的最終 confidence 分數：
- 資料品質 fresh + 3個以上具體數字支持 → 最高 90
- 資料品質 delayed → 最高 75
- 資料品質 stale 或 missing → 最高 55
- 財報在 7 天內 → 信心再降 10
- 步驟 A 中 missing 超過 2 項 → 信心再降 10
寫出：「資料品質 [X]，[Y] 個具體數字支持，信心上限 [Z]，最終決定信心 [N]。」

---JSON_START---
（在此行之後輸出 JSON，JSON 前不要有任何其他文字）`;
```

---

## Step 2: Inject into all 4 leaf agent prompt builders

For each of the following files, find the section that introduces the JSON output format instruction (usually near the end of the function, where `JSON_STRICT_RULE` or the schema string is referenced), and inject `REASONING_SCRATCHPAD_RULE` **before** the JSON schema.

### `src/lib/analysis/prompts/market-review.ts`

**Add to imports:**
```typescript
import {
  // ...existing imports...
  REASONING_SCRATCHPAD_RULE,
} from "@/lib/analysis/prompts/common";
```

**Find the section that says "輸出格式" or "只回傳 JSON" near the end of `buildMarketReviewPrompt`, and insert before it:**
```typescript
${REASONING_SCRATCHPAD_RULE}

## 輸出格式（JSON_START 之後）
${JSON_STRICT_RULE}
// ...rest of JSON schema...
```

### `src/lib/analysis/prompts/portfolio-review.ts`

Same pattern — add `REASONING_SCRATCHPAD_RULE` import, inject before the output format section.

### `src/lib/analysis/prompts/mission-analysis.ts`

Same pattern.

### `src/lib/analysis/prompts/market-scan.ts`

Same pattern.

**Do NOT add to**: `team-leader.ts`, `division-manager.ts`, `committee.ts` — these agents synthesize structured inputs from lower agents and don't benefit from the same scratchpad (they have their own synthesis logic).

---

## Step 3: Update `validateOrRepair` to handle scratchpad prefix

The scratchpad text appears before `---JSON_START---`. The `validateOrRepair` function currently tries to parse the entire model output as JSON, which will fail if there's a scratchpad prefix.

In `src/lib/analysis/pipeline/model.ts`, find the `validateOrRepair` function (or wherever raw text is parsed). Add a preprocessing step to strip the scratchpad:

```typescript
function extractJsonFromOutput(rawText: string): string {
  // If the model used the scratchpad format, extract only the JSON portion
  const jsonStartMarker = "---JSON_START---";
  const markerIndex = rawText.indexOf(jsonStartMarker);

  if (markerIndex !== -1) {
    // Everything after the marker is the JSON
    return rawText.slice(markerIndex + jsonStartMarker.length).trim();
  }

  // No scratchpad — return as-is (backward compatible)
  return rawText;
}
```

Then in the `validateOrRepair` function, before attempting to parse JSON:
```typescript
const cleanedText = extractJsonFromOutput(rawText);
// Use cleanedText instead of rawText for all JSON extraction/parsing
```

Also apply the same `extractJsonFromOutput` preprocessing in the main `callModel` result handler wherever JSON parsing first occurs.

---

## Step 4: TypeScript check

```bash
npx tsc --noEmit
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/prompts/common.ts` | Add `REASONING_SCRATCHPAD_RULE` constant |
| `src/lib/analysis/prompts/market-review.ts` | Import + inject `REASONING_SCRATCHPAD_RULE` before output section |
| `src/lib/analysis/prompts/portfolio-review.ts` | Same |
| `src/lib/analysis/prompts/mission-analysis.ts` | Same |
| `src/lib/analysis/prompts/market-scan.ts` | Same |
| `src/lib/analysis/pipeline/model.ts` | Add `extractJsonFromOutput()` to strip scratchpad before JSON parsing |

**Why this matters**: A model that must write "RSI = 62, close to 52W high, earnings unknown → confidence 70" BEFORE outputting `"confidence": 70` is orders of magnitude less likely to hallucinate than one that outputs both simultaneously. The scratchpad also makes debugging much easier — you can read what the agent was "thinking" before it made a bad call.
