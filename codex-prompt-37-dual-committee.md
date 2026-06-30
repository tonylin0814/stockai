# Codex Prompt 37 — Dual Committee: GPT + Claude Independent Reports

## Background

Currently the committee pipeline runs once using one model and produces a single `committee_decisions` row. The goal is to run the committee **twice** — once with gpt-5.5 (Committee A) and once with claude-sonnet-4-6 (Committee B) — and store both rows independently. The user reviews both reports and decides which view to act on. There is no meta-committee; both reports are terminal outputs.

Both committee runs receive the same input: the two division decisions (GPT Division + Claude Division). They simply interpret that input through different AI lenses.

---

## File 1: DB Migration — add `model_provider` to `committee_decisions`

Create a new migration file `supabase/migrations/<timestamp>_committee_model_provider.sql`:

```sql
alter table public.committee_decisions
  add column if not exists model_provider text not null default 'OpenAI';

comment on column public.committee_decisions.model_provider is
  'Which AI ran this committee pass: OpenAI (gpt-5.5) or Anthropic (claude-sonnet-4-6)';
```

No data migration needed — existing rows default to `'OpenAI'`.

---

## File 2: `src/lib/analysis/pipeline/committee.ts`

### Change 2a — Update return type

```ts
// Before:
export type CommitteePipelineResult =
  | { status: "completed"; decision: CommitteeDecision; committeeDecisionId: string }
  | { status: "failed"; error: string; decision: null; committeeDecisionId: null };

// After:
export type CommitteeRunResult =
  | { status: "completed"; decision: CommitteeDecision; committeeDecisionId: string; modelProvider: string }
  | { status: "failed"; error: string; decision: null; committeeDecisionId: null; modelProvider: string };

export type CommitteePipelineResult = CommitteeRunResult[];
```

### Change 2b — Replace `getCommitteeModelProvider` with `getAllDivisionModels`

Remove `getCommitteeModelProvider` (which only fetched one division's model). Replace with:

```ts
async function getAllDivisionModels(): Promise<
  Array<{ model_provider: string; model_name: string }>
> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("divisions")
    .select("model_provider, model_name")
    .eq("is_enabled", true)
    .eq("participates_in_committee", true)
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Cannot find division models for committee");
  }

  return data as Array<{ model_provider: string; model_name: string }>;
}
```

### Change 2c — Extract single-run logic into `runSingleCommitteePass`

Extract the existing single-run logic from `runCommitteePipeline` into a new private function:

```ts
async function runSingleCommitteePass(params: {
  divisionResults: Extract<DivisionPipelineResult, { status: "completed" }>[];
  model: { model_provider: string; model_name: string };
  dataPackage: DailyDataPackage;
  dailyRunId?: string | null;
  userId: string;
  missionId?: string;
}): Promise<CommitteeRunResult> {
  // Same logic as the existing runCommitteePipeline body, but:
  // - Use params.model.model_name directly (no getAnalysisModel() call)
  // - Include model_provider: params.model.model_provider in the DB insert
  // - Return modelProvider: params.model.model_provider in the result
}
```

Key changes inside this function vs the original:
- Replace `const committeeModel = getAnalysisModel(...)` with `const committeeModel = params.model.model_name`
- Add `model_provider: params.model.model_provider` to the `committeePayload` object
- Return type is `CommitteeRunResult` (includes `modelProvider`)

### Change 2d — Update `runCommitteePipeline` to run both passes

```ts
export async function runCommitteePipeline(params: {
  divisionResults: DivisionPipelineResult[];
  dataPackage: DailyDataPackage;
  dailyRunId?: string | null;
  userId: string;
  missionId?: string;
}): Promise<CommitteePipelineResult> {
  const completed = params.divisionResults.filter(
    (result): result is Extract<DivisionPipelineResult, { status: "completed" }> =>
      result.status === "completed"
  );

  if (completed.length < 2) {
    // Return 2 failed results so the caller always gets an array
    return [
      {
        status: "failed",
        error: "Committee requires at least 2 completed division decisions.",
        decision: null,
        committeeDecisionId: null,
        modelProvider: "OpenAI"
      },
      {
        status: "failed",
        error: "Committee requires at least 2 completed division decisions.",
        decision: null,
        committeeDecisionId: null,
        modelProvider: "Anthropic"
      }
    ];
  }

  const divisionModels = await getAllDivisionModels();

  // Run both passes sequentially (not parallel — cost guard tracks cumulative spend)
  const results: CommitteeRunResult[] = [];
  for (const model of divisionModels) {
    const result = await runSingleCommitteePass({
      divisionResults: completed,
      model,
      dataPackage: params.dataPackage,
      dailyRunId: params.dailyRunId,
      userId: params.userId,
      missionId: params.missionId
    });
    results.push(result);
  }

  return results;
}
```

Also delete `getAnalysisModel()` and `REPAIR_MODEL_MAP` is unchanged (repair still uses cheap models).

---

## File 3: `src/app/api/analysis/daily/continue/route.ts`

### Change 3a — Update `StoredCommitteeResult` type

```ts
// Before:
type StoredCommitteeResult =
  | { status: "completed"; decision: CommitteeDecision; committeeDecisionId: string }
  | { status: "failed"; error: string };

// After:
type StoredCommitteeResult =
  | { status: "completed"; decision: CommitteeDecision; committeeDecisionId: string; modelProvider: string }
  | { status: "failed"; error: string; modelProvider: string };
```

### Change 3b — Update run state to hold array

In the run state type, rename `committeeResult` → `committeeResults` and change type to array:

```ts
// Before:
committeeResult?: StoredCommitteeResult;

// After:
committeeResults?: StoredCommitteeResult[];
```

### Change 3c — Update committee stage handler

```ts
if (stage === "committee") {
  const committeeResults = await runCommitteePipeline({
    divisionResults: toDivisionPipelineResults(state.divisionResults ?? []),
    dataPackage,
    dailyRunId,
    userId: user.id
  });

  const storedResults: StoredCommitteeResult[] = committeeResults.map((result) =>
    result.status === "completed"
      ? {
          status: "completed",
          decision: result.decision,
          committeeDecisionId: result.committeeDecisionId,
          modelProvider: result.modelProvider
        }
      : { status: "failed", error: result.error, modelProvider: result.modelProvider }
  );

  await updateRunState(dailyRunId, {
    ...state,
    pipelineStage: "recommendations",
    stageMessage: "委員會完成，正在寫入建議。",
    committeeResults: storedResults
  });

  return NextResponse.json({ status: "running", stage: "recommendations", dailyRunId });
}
```

### Change 3d — Update recommendations stage to use first completed committee result

In the recommendations stage, find the first completed committee result (for backwards compatibility with `writeRecommendations` which expects a single committee decision):

```ts
// Before:
const committeeDecision =
  state.committeeResult?.status === "completed"
    ? {
        decision: state.committeeResult.decision,
        committeeDecisionId: state.committeeResult.committeeDecisionId
      }
    : null;

// After:
const firstCompletedCommittee = (state.committeeResults ?? []).find(
  (r): r is Extract<StoredCommitteeResult, { status: "completed" }> =>
    r.status === "completed"
);
const committeeDecision = firstCompletedCommittee
  ? {
      decision: firstCompletedCommittee.decision,
      committeeDecisionId: firstCompletedCommittee.committeeDecisionId
    }
  : null;
```

---

## File 4: `src/app/api/analysis/mission/[id]/route.ts`

Apply the same changes as File 3 — update `committeeResult` → `committeeResults` (array), update the committee call handling, and use first completed result for downstream steps.

---

## File 5: UI — Display Committee A and B side by side

### `src/app/analysis/daily/page.tsx`

This file has **two separate concerns** that both need updating:

#### 5a — 進度視窗：committee expected 從 1 改為 2

Find the `reportItems` array and the committee entry (around line 582–591). Change `expected: 1` to `expected: 2` and update the detail text:

```ts
// Before:
{
  label: "委員會決策",
  status: reportStatus({
    runStatus,
    count: progress.committeeDecisions,
    expected: 1,
    runningStage: "committee",
    currentStage
  }),
  detail: progress.committeeDecisions > 0 ? "委員會已產生最終決策。" : "等待 GPT 與 Anthropic division 完成後彙總。"
},

// After:
{
  label: "委員會決策",
  status: reportStatus({
    runStatus,
    count: progress.committeeDecisions,
    expected: 2,
    runningStage: "committee",
    currentStage
  }),
  detail: progress.committeeDecisions >= 2
    ? "Committee A (GPT) + Committee B (Claude) 均已完成。"
    : progress.committeeDecisions === 1
      ? "已完成 1/2 份委員會決策。"
      : "等待 GPT 與 Anthropic division 完成後彙總。"
},
```

#### 5b — 頁面顯示：查詢兩筆並並排顯示

The page currently queries `committee_decisions` and shows 1 result. Update to fetch both and display side by side.

Change the query to fetch all committee decisions for the run (ordered by `created_at`):

```ts
// Before: fetches single row
.from("committee_decisions")
.eq("daily_run_id", dailyRunId)
.single()

// After: fetches both rows
.from("committee_decisions")
.eq("daily_run_id", dailyRunId)
.order("created_at", { ascending: true })
// returns array — first item is Committee A (GPT), second is Committee B (Claude)
```

In the render, if 2 committee decisions are present, show them in a two-column layout:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {committeeDecisions.map((decision) => (
    <CommitteeDecisionCard
      key={decision.id}
      decision={decision}
      label={decision.model_provider === "OpenAI" ? "Committee A · GPT" : "Committee B · Claude"}
    />
  ))}
</div>
```

### `src/app/reports/[id]/page.tsx`

Same change: query all committee_decisions for the run, display both if present.

### `src/app/analysis/cio/page.tsx`

Same change: query returns array, render both if present.

---

## What does NOT change

- `CommitteeDecision` schema in `schemas.ts` — unchanged, both passes output the same JSON structure
- `writeRecommendations` in `recommendations.ts` — unchanged, it uses the first completed committee decision (Change 3d above)
- `buildCommitteePrompt` in `prompts/committee.ts` — unchanged, both passes use the same prompt template
- `validateOrRepair` logic — unchanged, each pass still validates its own output
- Mission pipeline behavior — same dual-committee treatment applied in `mission/[id]/route.ts`

---

## Summary of changes

| File | Change |
|------|--------|
| New migration | Add `model_provider` column to `committee_decisions` |
| `committee.ts` | Run pipeline twice (once per division model), return `CommitteeRunResult[]` |
| `continue/route.ts` | `committeeResult` → `committeeResults[]`, handle array |
| `mission/[id]/route.ts` | Same as above |
| `analysis/daily/page.tsx` | Show Committee A and B side by side |
| `reports/[id]/page.tsx` | Show both committee decisions |
| `analysis/cio/page.tsx` | Show both committee decisions |
