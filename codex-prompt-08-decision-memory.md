# Codex Prompt 08 — Decision Memory

**Goal**: Inject the system's own past recommendations and outcomes into team leader and division manager prompts so agents can learn from history (避免重複錯誤、強化有效策略).

**Apply after**: Prompts 01–07 applied.

---

## Step 1: Create `src/lib/analysis/decision-memory.ts`

Create this file from scratch:

```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type SymbolHistory = {
  symbol: string;
  recentDecisions: RecentDecision[];
};

type RecentDecision = {
  date: string;
  action: string;
  confidence: number;
  source: string; // e.g. "GPT Division" or "team:Alpha"
  targetPrice: number | null;
  stopLoss: number | null;
  outcomes: OutcomeSummary[];
};

type OutcomeSummary = {
  horizonDays: number;
  returnPct: number | null;
  directionCorrect: boolean | null;
  hitTarget: boolean | null;
  hitStopLoss: boolean | null;
  scoreDelta: number | null;
};

/**
 * Fetches last 60 days of recommendations + outcomes for the given symbols.
 * Returns a compact text block suitable for injection into prompts.
 */
export async function buildDecisionMemory(
  userId: string,
  symbols: string[]
): Promise<string> {
  if (!symbols.length) return "";

  const supabase = createSupabaseServiceClient();

  // 1. Fetch recommendations for these symbols in the last 60 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const { data: recs, error } = await supabase
    .from("recommendations")
    .select(`
      id,
      action,
      confidence,
      source_type,
      source_name,
      target_price,
      stop_loss,
      recommendation_date,
      securities!inner(symbol, market),
      recommendation_outcomes(
        horizon_days,
        return_pct,
        direction_correct,
        hit_target,
        hit_stop_loss,
        score_delta
      )
    `)
    .eq("user_id", userId)
    .in("securities.symbol", symbols)
    .gte("recommendation_date", cutoff.toISOString())
    .order("recommendation_date", { ascending: false })
    .limit(50);

  if (error || !recs || recs.length === 0) return "";

  // 2. Group by symbol
  const bySymbol: Record<string, RecentDecision[]> = {};

  for (const rec of recs as any[]) {
    const symbol: string = rec.securities?.symbol ?? "?";
    if (!bySymbol[symbol]) bySymbol[symbol] = [];

    const outcomes: OutcomeSummary[] = (rec.recommendation_outcomes ?? []).map(
      (o: any) => ({
        horizonDays: o.horizon_days,
        returnPct: o.return_pct ?? null,
        directionCorrect: o.direction_correct ?? null,
        hitTarget: o.hit_target ?? null,
        hitStopLoss: o.hit_stop_loss ?? null,
        scoreDelta: o.score_delta ?? null,
      })
    );

    bySymbol[symbol].push({
      date: rec.recommendation_date?.slice(0, 10) ?? "?",
      action: rec.action,
      confidence: rec.confidence ?? 0,
      source: `${rec.source_type ?? ""}/${rec.source_name ?? ""}`,
      targetPrice: rec.target_price ?? null,
      stopLoss: rec.stop_loss ?? null,
      outcomes,
    });
  }

  // 3. Format as compact text
  const lines: string[] = ["## 本系統過去決策記錄（最近 60 天）"];

  for (const symbol of symbols) {
    const history = bySymbol[symbol];
    if (!history?.length) continue;

    lines.push(`\n### ${symbol}`);

    // Only show last 3 per symbol to keep tokens low
    for (const dec of history.slice(0, 3)) {
      const tp = dec.targetPrice ? `目標${dec.targetPrice}` : "";
      const sl = dec.stopLoss ? `停損${dec.stopLoss}` : "";
      const priceStr = [tp, sl].filter(Boolean).join(" / ");

      lines.push(
        `- ${dec.date} | ${dec.action}（信心 ${dec.confidence}%）| 來源：${dec.source}${priceStr ? ` | ${priceStr}` : ""}`
      );

      if (dec.outcomes.length === 0) {
        lines.push("  → 尚無追蹤結果");
      } else {
        for (const o of dec.outcomes.sort((a, b) => a.horizonDays - b.horizonDays)) {
          const ret = o.returnPct !== null ? `報酬 ${o.returnPct > 0 ? "+" : ""}${o.returnPct.toFixed(1)}%` : "";
          const dir = o.directionCorrect !== null ? (o.directionCorrect ? "方向✓" : "方向✗") : "";
          const tgt = o.hitTarget === true ? "達標" : o.hitTarget === false ? "未達標" : "";
          const stp = o.hitStopLoss === true ? "觸停損" : "";
          const parts = [ret, dir, tgt, stp].filter(Boolean).join(" | ");
          lines.push(`  → ${o.horizonDays}天後：${parts || "記錄中"}`);
        }
      }
    }
  }

  return lines.join("\n");
}
```

---

## Step 2: Add `decisionMemory` to `DailyDataPackage`

In `src/lib/analysis/data-package.ts`:

**2a. Add import at the top:**
```typescript
import { buildDecisionMemory } from "@/lib/market-data/../analysis/decision-memory";
```
Wait — the file is in `src/lib/analysis/`, so use:
```typescript
import { buildDecisionMemory } from "@/lib/analysis/decision-memory";
```

**2b. Add field to `DailyDataPackage` type:**
```typescript
export type DailyDataPackage = {
  // ... existing fields ...
  decisionMemory: string; // ADD THIS
};
```

**2c. In `buildDailyDataPackage()`, collect portfolio and watchlist symbols, then call `buildDecisionMemory`.**

Find the section where the package object is assembled (the `return { ... }` at the end of `buildDailyDataPackage`). Before that return, add:

```typescript
// Collect all symbols
const allSymbols = [
  ...portfolio.map((item) => item.symbol),
  ...watchlist.map((item) => item.symbol),
];

const decisionMemory = await buildDecisionMemory(userId, allSymbols);
```

Then include `decisionMemory` in the returned object:
```typescript
return {
  // ... existing fields ...
  decisionMemory,
};
```

**Note**: `buildDailyDataPackage` already takes `userId` as a parameter. If it doesn't, check the function signature and add it. The function is called from the API route — make sure the call site also passes `userId`.

---

## Step 3: Inject into team leader prompt

In `src/lib/analysis/prompts/team-leader.ts` (or whatever file builds the team leader prompt — look for `buildTeamLeaderPrompt` or `buildMarketReviewPrompt`):

Add `decisionMemory` to the prompt parameters and inject it before the output schema section.

**Add to the prompt function parameters:**
```typescript
export function buildTeamLeaderPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage,
  teamReports: TeamReport[]
) {
```

**Inside the prompt string, after the team reports section, add:**
```typescript
${dataPackage.decisionMemory ? `
## 決策歷史參考

${dataPackage.decisionMemory}

**使用指引**：
- 若過去建議方向正確（方向✓、達標）：可適度強化相同方向的信心
- 若過去建議方向錯誤（方向✗）：需說明這次判斷為什麼不同，或是否仍維持觀望
- 若過去觸停損：必須在風險評估中提及，並評估是否情況已改變
- 若尚無追蹤結果：中性參考，注意一致性
` : ""}
```

---

## Step 4: Inject into division manager prompt

In `src/lib/analysis/prompts/division-manager.ts`:

**Add `decisionMemory` to `buildDivisionManagerPrompt` parameters:**
```typescript
export function buildDivisionManagerPrompt(params: {
  divisionName: string;
  managerName: string;
  teamReports: TeamReport[];
  dataPackageSummary: unknown;
  decisionMemory?: string; // ADD THIS
}) {
```

**Inside the prompt string, add after team reports summary:**
```typescript
${params.decisionMemory ? `
## 過去決策績效摘要

${params.decisionMemory}

作為 Division Manager，你必須評估本次分析與過去決策的一致性：
- 若本次建議與近期已驗證的有效建議方向相同：可略微提高信心（+5 左右）
- 若本次建議與近期失敗建議方向相同：必須在 internalDisagreements 中說明為何這次不同
- 若過去建議尚未到期評估：中性，保持獨立判斷
` : ""}
```

**In `division.ts`, pass `decisionMemory` when calling `buildDivisionManagerPrompt`:**

Find this call:
```typescript
const prompt = buildDivisionManagerPrompt({
  divisionName: params.division.name,
  managerName: params.division.manager_name,
  teamReports,
  dataPackageSummary: dataPackageSummary(params.dataPackage)
});
```

Change to:
```typescript
const prompt = buildDivisionManagerPrompt({
  divisionName: params.division.name,
  managerName: params.division.manager_name,
  teamReports,
  dataPackageSummary: dataPackageSummary(params.dataPackage),
  decisionMemory: params.dataPackage.decisionMemory,
});
```

---

## Step 5: Update team pipeline to pass decisionMemory

In the team pipeline (team.ts or wherever the team agent prompts are built), any prompt that receives `dataPackage` already has access to `dataPackage.decisionMemory` — no extra change needed if the prompt builders reference it from `dataPackage` directly.

If team agents use individual prompt builders that don't receive the full `dataPackage`, check whether `mission-analysis.ts` needs the same injection. The mission analysis agent is the most important team-level agent to add it to, since it decides today's priority action. Follow the same pattern as Step 3.

---

## Verification

After applying:

1. Run a mission and check Supabase `pipeline_agent_runs` — the prompt for division manager should now contain "決策歷史參考" if any past recommendations exist for those symbols.
2. If it's a first run with no history, `decisionMemory` will be `""` and the block won't appear — that's correct behavior.
3. Check TypeScript compiles: `npx tsc --noEmit`

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/decision-memory.ts` | **CREATE** — query + format past decisions |
| `src/lib/analysis/data-package.ts` | Add `decisionMemory: string` to type + populate in builder |
| `src/lib/analysis/prompts/team-leader.ts` | Inject decision history block |
| `src/lib/analysis/prompts/division-manager.ts` | Add `decisionMemory?` param + inject block |
| `src/lib/analysis/pipeline/division.ts` | Pass `dataPackage.decisionMemory` to division manager prompt |
