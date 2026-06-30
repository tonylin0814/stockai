# Codex Prompt 20 — Strict Confidence Calibration

**Goal**: Make confidence scores meaningful. Right now an agent can output `"confidence": 85` on stale data or missing fundamentals. This prompt adds hard caps enforced at both the prompt level AND the validation level — so even if the model ignores the prompt instruction, `validateOrRepair` will correct the score before it's saved.

**Apply after**: Prompts 01–19 applied.

---

## Step 1: Replace `DATA_QUALITY_RULE` in `src/lib/analysis/prompts/common.ts`

Find the existing:
```typescript
export const DATA_QUALITY_RULE =
  "若資料品質為 missing 或 stale，信心分數上限為 60。若關鍵價格資料為 missing，action 必須是 wait 或 insufficient_data，不得給出 buy 或 small_buy。";
```

Replace with a more detailed constant:
```typescript
export const DATA_QUALITY_RULE = `## 資料品質與信心度規則（強制執行）

**資料品質對信心的硬上限：**
| 資料品質     | 信心上限 |
|-------------|---------|
| fresh       | 90      |
| delayed     | 75      |
| stale       | 55      |
| missing     | 40      |
| conflicting | 50      |

若多個股票的資料品質不同，以最差的那個決定整體信心上限。

**財報風險降低信心：**
- 財報日在 7 天內 → 信心再降 10（因不確定性過高）
- 財報日在 8–14 天內 → 信心再降 5

**關鍵資料缺失對行動的限制：**
- 現價 missing → action 只能是 wait 或 insufficient_data，絕對禁止 buy / small_buy / add
- 現價 stale（超過 2 天）→ action 只能是 watch 或 wait，不得 buy
- 基本面和新聞同時缺失 → confidence 不超過 50

**高信心的最低證據要求：**
- confidence > 75 → 必須在 reason 欄位引用至少 3 個具體數字（價格、指標、百分比等）
- confidence > 85 → 必須引用至少 5 個具體數字，且資料品質必須是 fresh
- confidence = 90 只保留給：資料完整、技術/基本面/新聞全部一致、無即將財報、有明確催化劑的情況`;
```

---

## Step 2: Add `CONFIDENCE_CALIBRATION_GUIDE` constant

Add this new constant after `DATA_QUALITY_RULE` in `common.ts`:

```typescript
export const CONFIDENCE_CALIBRATION_GUIDE = `## 信心度校準指引（Confidence Calibration）

信心度不是「你感覺多有把握」，而是「根據現有資料，這個判斷正確的客觀機率」。

**校準錨點：**
- 60 = 比隨機猜測稍好，資料不完整或有明顯矛盾
- 70 = 合理判斷，主要技術或基本面指標支持，但有一個以上重要未知因素
- 80 = 強力判斷，多個獨立指標一致，無即將財報，資料品質 fresh
- 85 = 非常強力，技術+基本面+新聞三者一致，有具體催化劑，部位風險可控
- 90 = 所有指標一致、資料完整、多重確認，此分數應非常少見

**常見錯誤（不得犯）：**
- 資料只有價格和成交量，卻給 80+
- 無法解釋為何是這個信心數字
- 所有分析都給 75–85（信心通膨，失去區分度）
- 好消息 = 高信心，壞消息 = 低信心（情緒偏差）`;
```

---

## Step 3: Add server-side confidence enforcement in `src/lib/analysis/pipeline/model.ts`

Add a function that enforces confidence caps AFTER the model outputs JSON and BEFORE it's saved. This is the hard backstop — even if the model ignores the prompt, this function corrects it.

Add this function to `model.ts`:

```typescript
import type { DataQualityState } from "@/lib/market-data/types";

interface ConfidenceContext {
  /** Worst data quality state among relevant symbols */
  dataQualityState?: DataQualityState | null;
  /** Days until nearest upcoming earnings (null if none) */
  daysUntilEarnings?: number | null;
}

const QUALITY_CONFIDENCE_CAPS: Record<DataQualityState, number> = {
  fresh:       90,
  delayed:     75,
  stale:       55,
  missing:     40,
  conflicting: 50,
};

export function enforceConfidenceCap(
  confidence: number,
  context: ConfidenceContext
): number {
  let cap = 90;

  if (context.dataQualityState) {
    cap = Math.min(cap, QUALITY_CONFIDENCE_CAPS[context.dataQualityState] ?? 60);
  }

  if (context.daysUntilEarnings !== null && context.daysUntilEarnings !== undefined) {
    if (context.daysUntilEarnings <= 7)  cap = Math.min(cap, cap - 10);
    if (context.daysUntilEarnings <= 14) cap = Math.min(cap, cap - 5);
  }

  return Math.min(confidence, Math.max(cap, 0));
}
```

---

## Step 4: Apply `enforceConfidenceCap` in team.ts after validation

In `src/lib/analysis/pipeline/team.ts`, after each leaf agent's `validateOrRepair` returns a parsed result, apply the cap.

For the **portfolio review** results (which have `portfolioReview` array with `confidence` per item):

```typescript
// After validation.parsed is obtained for portfolio review:
const agentOutput = validation.parsed;

// Determine worst quality state from data package
const worstQuality = getWorstQualityState(dataPackage); // implement below
const daysUntilEarnings = getMinDaysUntilEarnings(dataPackage); // implement below

// Apply cap to each portfolio item's confidence
if (agentOutput.confidence !== undefined) {
  agentOutput.confidence = enforceConfidenceCap(agentOutput.confidence, {
    dataQualityState: worstQuality,
    daysUntilEarnings
  });
}
```

Add these two helper functions to `team.ts`:

```typescript
function getWorstQualityState(dataPackage: DailyDataPackage): DataQualityState {
  const states: DataQualityState[] = ["fresh", "delayed", "stale", "conflicting", "missing"];
  const qualityRank: Record<DataQualityState, number> = {
    fresh: 0, delayed: 1, conflicting: 2, stale: 3, missing: 4
  };

  let worst: DataQualityState = "fresh";
  for (const item of [...dataPackage.portfolio, ...dataPackage.watchlist]) {
    const q = item.quote?.qualityState;
    if (q && qualityRank[q] > qualityRank[worst]) {
      worst = q;
    }
  }
  return worst;
}

function getMinDaysUntilEarnings(dataPackage: DailyDataPackage): number | null {
  if (!dataPackage.upcomingEarnings?.length) return null;
  const days = dataPackage.upcomingEarnings.map((e) => e.daysUntil).filter((d) => d >= 0);
  return days.length ? Math.min(...days) : null;
}
```

Apply the same cap to:
- `AgentOutput.confidence` (leaf agents)
- `MissionAnalysis.confidence` (mission analysis agent)
- `TeamReport.marketView.confidence` and `TeamReport.finalTeamView.confidence` (team leader)

**Do NOT apply to Division Manager or Committee** — they aggregate across multiple quality states and apply their own judgment.

---

## Step 5: Inject both constants into all 4 leaf agent prompts

In `market-review.ts`, `portfolio-review.ts`, `mission-analysis.ts`, `market-scan.ts`:

**Add to imports:**
```typescript
import {
  // ...existing...
  CONFIDENCE_CALIBRATION_GUIDE,
} from "@/lib/analysis/prompts/common";
```

`DATA_QUALITY_RULE` is already imported. The new `CONFIDENCE_CALIBRATION_GUIDE` adds the calibration anchors (60/70/80/85/90 meaning). Inject it in the same section where `DATA_QUALITY_RULE` appears:

```typescript
${DATA_QUALITY_RULE}

${CONFIDENCE_CALIBRATION_GUIDE}
```

---

## Step 6: TypeScript check

```bash
npx tsc --noEmit
```

Common issues:
- `DataQualityState` import in `model.ts` — add `import type { DataQualityState } from "@/lib/market-data/types"`
- `DailyDataPackage` type in helper functions — already imported in `team.ts`
- `upcomingEarnings` may not exist on `DailyDataPackage` if Prompt 11 wasn't applied yet — use optional chaining

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/prompts/common.ts` | Replace `DATA_QUALITY_RULE` with detailed version; add `CONFIDENCE_CALIBRATION_GUIDE` |
| `src/lib/analysis/prompts/market-review.ts` | Import + inject `CONFIDENCE_CALIBRATION_GUIDE` |
| `src/lib/analysis/prompts/portfolio-review.ts` | Same |
| `src/lib/analysis/prompts/mission-analysis.ts` | Same |
| `src/lib/analysis/prompts/market-scan.ts` | Same |
| `src/lib/analysis/pipeline/model.ts` | Add `enforceConfidenceCap()` function |
| `src/lib/analysis/pipeline/team.ts` | Call `enforceConfidenceCap()` after validation for all leaf agents + team leader |

**Expected result**: Confidence scores become meaningful:
- A `fresh` data run on a stock with clear technicals → might reach 82–85
- A `delayed` data run (most TW stocks during US hours) → capped at 75
- A stock with earnings in 5 days → capped at 65 (75 - 10)
- Missing price data → capped at 40, action forced to `wait`
