# Codex Prompt 36 — Remove missionAnalysis from Daily Analysis Pipeline

## Background

The daily analysis pipeline (`/api/analysis/daily/continue`) runs 4 leaf agents per team:
`marketReview`, `portfolioReview`, `missionAnalysis`, `marketScan`.

**The problem:** `missionAnalysis` is designed for user-triggered missions (specific questions like "should I buy 2330?"). In the daily pipeline, there is no mission — the data package has no mission data. The agent runs anyway and produces noise output. It is a wasted AI call every single day per team.

Missions are a completely separate flow (`/api/analysis/mission/[id]`), which correctly calls `runDivisionPipeline` with a `missionId`. That path should keep `missionAnalysis` fully intact.

**Goal:** Skip `missionAnalysis` leaf agent in daily runs (no `missionId`). Keep it running in mission runs (has `missionId`). No other behaviour changes.

---

## File 1: `src/lib/analysis/pipeline/team.ts`

### Change 1a — Filter agentSteps based on missionId

Find the `agentSteps` array and the `for (const step of agentSteps)` loop inside `runTeamPipeline`. Replace the loop to skip `missionAnalysis` when there is no `missionId`:

```ts
// Before:
for (const step of agentSteps) {

// After:
const activeSteps = agentSteps.filter(
  (step) => step.promptKey !== "missionAnalysis" || Boolean(params.missionId)
);
for (const step of activeSteps) {
```

That's the only change needed in the loop itself.

### Change 1b — Handle missing missionAnalysis when building the team report

Around line 269, the team report is assembled with `report.missionAnalysis`. This will fail if `missionAnalysis` was skipped. Make it optional:

```ts
// Before:
missionAnalysis: {
  ...report.missionAnalysis,
  confidence: capConfidence(report.missionAnalysis.confidence, dataPackage)
},

// After:
missionAnalysis: report.missionAnalysis
  ? {
      ...report.missionAnalysis,
      confidence: capConfidence(report.missionAnalysis.confidence, dataPackage)
    }
  : null,
```

### Change 1c — Handle null when saving to DB

Around line 662, the `team_reports` DB insert includes `mission_analysis: report.missionAnalysis`. This is fine — the column already allows null. No change needed IF the schema change below is applied. Just verify the insert doesn't throw on null.

---

## File 2: `src/lib/analysis/schemas.ts`

### Change 2a — Make missionAnalysis optional in TeamReportSchema

Find `TeamReportSchema` and make `missionAnalysis` nullable:

```ts
// Before:
export const TeamReportSchema = z.object({
  teamName: z.string(),
  date: z.string(),
  leader: z.string(),
  marketView: MarketViewSchema,
  portfolioReview: z.array(PortfolioReviewItemSchema),
  missionAnalysis: MissionAnalysisSchema,
  marketScanRecommendations: z.array(MarketScanRecommendationSchema),
  finalTeamView: FinalTeamViewSchema
});

// After:
export const TeamReportSchema = z.object({
  teamName: z.string(),
  date: z.string(),
  leader: z.string(),
  marketView: MarketViewSchema,
  portfolioReview: z.array(PortfolioReviewItemSchema),
  missionAnalysis: MissionAnalysisSchema.nullable().optional(),
  marketScanRecommendations: z.array(MarketScanRecommendationSchema),
  finalTeamView: FinalTeamViewSchema
});
```

Also update the `TEAM_REPORT_JSON_SCHEMA` string constant (used in the team leader prompt) to mark `missionAnalysis` as optional:

Find the `"missionAnalysis"` block in `TEAM_REPORT_JSON_SCHEMA` and add a comment indicating it can be null in daily runs:

```ts
"missionAnalysis": {
  // null when running in daily analysis mode (no active mission)
  // populated when running inside a user-triggered mission
  ...
}
```

---

## File 3: `src/lib/analysis/prompts/team-leader.ts`

The team leader prompt currently says:

```
missionAnalysis：
- 整合 Mission Analysis agent 的每日掃描結論
- missionTitle 描述今日最重要任務
```

Update this section so the team leader knows missionAnalysis may be absent in daily runs:

```ts
// Replace the missionAnalysis section with:
`missionAnalysis：
- 若 agentOutputs 中有 missionAnalysis 資料（任務模式），整合其結論，missionTitle 描述今日最重要任務
- 若 agentOutputs 中無 missionAnalysis（日常分析模式），將此欄位輸出為 null，不要編造任務內容`
```

---

## File 4: `src/lib/analysis/prompts/division-manager.ts`

Find the section that instructs the division manager to read `missionAnalysis` from team reports (around line 79–81):

```
你必須輸出 missionDecision 欄位，整合所有 team 的 missionAnalysis 結論。
從 5 個 team reports 中，讀取每個 team 的 missionAnalysis 欄位，然後：
```

Update to handle the null case:

```ts
// Replace with:
`若 team reports 中有 missionAnalysis 資料（任務模式），整合所有 team 的 missionAnalysis 結論，輸出 missionDecision 欄位。
若所有 team 的 missionAnalysis 均為 null（日常分析模式），將 missionDecision 欄位輸出為 null。不要編造任務。`
```

---

## What does NOT change

- `src/app/api/analysis/mission/[id]/route.ts` — untouched. Mission runs call `runDivisionPipeline` with `missionId`, which passes it into `runTeamPipeline`. The filter `Boolean(params.missionId)` will be `true`, so all 4 agents including `missionAnalysis` still run.
- `src/lib/analysis/pipeline/single-stock.ts` — untouched. This is the quick 2-call path for single stock missions.
- `src/lib/analysis/prompts/mission-analysis.ts` — untouched. The prompt itself is unchanged.
- DB schema — `team_reports.mission_analysis` column already nullable. No migration needed.

---

## Expected result

Daily analysis: 3 leaf agents per team (was 4) → saves 1 call per team.
With 2 teams × 2 divisions = 4 teams → **saves 4 AI calls per daily run**.
With `validateOrRepair` that's potentially **8 fewer calls per run**.

Mission analysis: unchanged, all 4 agents still run including missionAnalysis.

The division manager and committee outputs will remain identical in structure — they already handle optional/null fields via Zod `.nullable().optional()`.
