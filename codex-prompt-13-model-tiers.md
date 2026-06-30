# Codex Prompt 13 — Model Tier Optimization (合理使用模型降低成本)

**Goal**: Stop using expensive models for tasks that don't need them. Each pipeline stage should use the cheapest model that can do the job well. Division Manager and Committee keep high-end models because they make real decisions. Leaf agents and JSON repair switch to cheaper models.

**Apply after**: Prompts 01–12 applied.

---

## Model Tier Strategy

| 階段 | 任務複雜度 | 現在 | 改成 |
|------|-----------|------|------|
| 葉代理人 × 40 (market/portfolio/mission/scan) | 低：套用固定框架分析資料 | gpt-5.5 / claude-sonnet | **gpt-4o / claude-haiku** |
| 團隊領導者 × 10 | 中：整合4個結構化輸出 | gpt-5.5 / claude-sonnet | **gpt-4o / claude-sonnet** |
| Division Manager × 2 | 高：複雜判斷 + missionDecision | gpt-5.5 / claude-sonnet | 不變（保持高階）|
| 委員會 × 1 | 最高：最終行動決策 | gpt-5.5 | 不變（保持高階）|
| validateOrRepair（每次 AI 輸出後） | 極低：修 JSON 格式 | 跟 agent 同一模型 | **gpt-4o-mini / claude-haiku** |
| Web Research 合成 | 低：整理文字成摘要 | gpt-4o（prompt 12）| 不變 |

**預估節省**：每次 mission run 費用降低約 **50-60%**，分析品質基本不受影響（高階模型用在真正需要判斷的地方）。

---

## Step 1: Update `src/lib/analysis/pipeline/team.ts`

### 1a. Add model tier constants at the top of the file (after imports)

```typescript
// ─── Model Tier Configuration ────────────────────────────────────────────────
//
// Leaf agents (market review, portfolio review, mission analysis, market scan)
// do structured analysis using fixed frameworks. They don't need the most
// capable model — gpt-4o / claude-haiku is sufficient and significantly cheaper.
//
// Team leader synthesizes 4 structured JSON outputs — gpt-4o for OpenAI,
// keep claude-sonnet for Anthropic (better synthesis quality).
//
// Division Manager and Committee are NOT touched here — they use the model
// configured in the database (divisions.model_name), which should remain
// high-tier (gpt-5.5 / claude-sonnet-4-6).

const LEAF_AGENT_MODEL_MAP: Record<string, string> = {
  // OpenAI: leaf agents use gpt-4o (50% cheaper than gpt-5.5, still strong)
  "gpt-5.5": "gpt-4o",
  "gpt-5":   "gpt-4o",
  "gpt-4o":  "gpt-4o",   // already low-tier, no change

  // Anthropic: leaf agents use claude-haiku (75% cheaper than sonnet)
  "claude-sonnet-4-6":    "claude-haiku-4-5-20251001",
  "claude-sonnet-latest": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5":    "claude-haiku-4-5-20251001",
};

const TEAM_LEADER_MODEL_MAP: Record<string, string> = {
  // OpenAI: team leader uses gpt-4o (synthesizes structured JSON, doesn't need gpt-5.5)
  "gpt-5.5": "gpt-4o",
  "gpt-5":   "gpt-4o",
  "gpt-4o":  "gpt-4o",

  // Anthropic: keep sonnet for team leader (synthesis benefits from better model)
  "claude-sonnet-4-6":    "claude-sonnet-4-6",
  "claude-sonnet-latest": "claude-sonnet-latest",
  "claude-sonnet-4-5":    "claude-sonnet-4-5",
};

// Cheapest model per provider for JSON repair tasks
const REPAIR_MODEL_MAP: Record<string, string> = {
  "OpenAI":    "gpt-4o-mini",               // $0.15/1M input — 97% cheaper than gpt-5.5
  "Anthropic": "claude-haiku-4-5-20251001", // $0.80/1M input — 75% cheaper than sonnet
};

function getLeafAgentModel(divisionModel: string): string {
  return LEAF_AGENT_MODEL_MAP[divisionModel] ?? divisionModel;
}

function getTeamLeaderModel(divisionModel: string): string {
  return TEAM_LEADER_MODEL_MAP[divisionModel] ?? divisionModel;
}

function getRepairModel(provider: string): string {
  return REPAIR_MODEL_MAP[provider] ?? "gpt-4o-mini";
}
// ─────────────────────────────────────────────────────────────────────────────
```

### 1b. Update `MODEL_COST_PER_1M` to include new models

```typescript
const MODEL_COST_PER_1M: Record<string, { input: number; output: number }> = {
  // High-tier (Division Manager, Committee)
  "gpt-5":   { input: 10, output: 40 },
  "gpt-5.5": { input: 10, output: 40 },

  // Mid-tier (Team Leader OpenAI, Leaf Agents OpenAI)
  "gpt-4o":  { input: 5, output: 15 },

  // Low-tier (JSON Repair OpenAI)
  "gpt-4o-mini": { input: 0.15, output: 0.60 },

  // Mid-tier (Team Leader Anthropic, Division Manager Anthropic)
  "claude-sonnet-4-5":    { input: 3, output: 15 },
  "claude-sonnet-4-6":    { input: 3, output: 15 },
  "claude-sonnet-latest": { input: 3, output: 15 },

  // Low-tier (Leaf Agents Anthropic, JSON Repair Anthropic)
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4 },
};
```

### 1c. Update leaf agent loop to use `getLeafAgentModel()`

Find the `for (const step of agentSteps)` loop in `runTeamPipeline`. 

**Change the `callModel` call for leaf agents:**

```typescript
// BEFORE:
const modelResult = await callModel({
  provider: params.division.model_provider,
  model: params.division.model_name,
  prompt
});

// AFTER:
const leafModel = getLeafAgentModel(params.division.model_name);
const modelResult = await callModel({
  provider: params.division.model_provider,
  model: leafModel,  // ← downgraded model
  prompt
});
```

**Change the `validateOrRepair` call inside the leaf agent loop:**

```typescript
// BEFORE:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: AgentOutputSchema,
  schemaDescription: AGENT_OUTPUT_JSON_SCHEMA,
  provider: params.division.model_provider,
  model: params.division.model_name  // ← expensive
});

// AFTER:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: AgentOutputSchema,
  schemaDescription: AGENT_OUTPUT_JSON_SCHEMA,
  provider: params.division.model_provider,
  model: getRepairModel(params.division.model_provider)  // ← cheapest repair model
});
```

**Also update `saveAgentRun` inside the leaf agent loop to log the actual model used:**

```typescript
await saveAgentRun({
  // ...
  provider: params.division.model_provider,
  model: leafModel,  // ← log actual model used, not division's model
  // ...
});
```

### 1d. Update team leader call to use `getTeamLeaderModel()`

Find the team leader section (after the `for` loop, where `buildTeamLeaderPrompt` is called):

```typescript
// BEFORE:
const modelResult = await callModel({
  provider: params.division.model_provider,
  model: params.division.model_name,
  prompt: teamLeaderPrompt
});

// AFTER:
const leaderModel = getTeamLeaderModel(params.division.model_name);
const modelResult = await callModel({
  provider: params.division.model_provider,
  model: leaderModel,  // ← mid-tier model
  prompt: teamLeaderPrompt
});
```

**Change the team leader's `validateOrRepair`:**

```typescript
// BEFORE:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: TeamReportSchema,
  schemaDescription: TEAM_REPORT_JSON_SCHEMA,
  provider: params.division.model_provider,
  model: params.division.model_name  // ← expensive
});

// AFTER:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: TeamReportSchema,
  schemaDescription: TEAM_REPORT_JSON_SCHEMA,
  provider: params.division.model_provider,
  model: getRepairModel(params.division.model_provider)  // ← cheapest
});
```

**Update `saveAgentRun` for team leader to log actual model:**
```typescript
model: leaderModel,  // ← log actual model used
```

---

## Step 2: Update `src/lib/analysis/pipeline/division.ts`

Division Manager keeps its high-end model from the database. Only change `validateOrRepair` to use a cheaper repair model.

**Add import or inline the repair model logic:**

At the top of `division.ts`, add:
```typescript
const REPAIR_MODEL_MAP: Record<string, string> = {
  "OpenAI":    "gpt-4o-mini",
  "Anthropic": "claude-haiku-4-5-20251001",
};

function getRepairModel(provider: string): string {
  return REPAIR_MODEL_MAP[provider] ?? "gpt-4o-mini";
}
```

**Find the `validateOrRepair` call in `runDivisionPipeline`:**

```typescript
// BEFORE:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: DivisionDecisionSchema,
  schemaDescription: DIVISION_DECISION_JSON_SCHEMA,
  provider: params.division.model_provider,
  model: params.division.model_name  // ← expensive
});

// AFTER:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: DivisionDecisionSchema,
  schemaDescription: DIVISION_DECISION_JSON_SCHEMA,
  provider: params.division.model_provider,
  model: getRepairModel(params.division.model_provider)  // ← cheapest repair
});
```

Note: The `callModel` call for Division Manager stays unchanged — it uses `params.division.model_name` (high-tier from DB).

---

## Step 3: Update `src/lib/analysis/pipeline/committee.ts`

Same pattern as division.ts. Committee keeps high-end model, only repair changes.

**Add at top of `committee.ts`:**
```typescript
const REPAIR_MODEL_MAP: Record<string, string> = {
  "OpenAI":    "gpt-4o-mini",
  "Anthropic": "claude-haiku-4-5-20251001",
};

function getRepairModel(provider: string): string {
  return REPAIR_MODEL_MAP[provider] ?? "gpt-4o-mini";
}
```

**Find `validateOrRepair` in `runCommitteePipeline`:**

```typescript
// BEFORE:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: CommitteeDecisionSchema,
  schemaDescription: COMMITTEE_DECISION_JSON_SCHEMA,
  provider: model.model_provider,
  model: model.model_name  // ← expensive
});

// AFTER:
const validation = await validateOrRepair({
  rawText: modelResult.text,
  schema: CommitteeDecisionSchema,
  schemaDescription: COMMITTEE_DECISION_JSON_SCHEMA,
  provider: model.model_provider,
  model: getRepairModel(model.model_provider)  // ← cheapest repair
});
```

---

## Step 4: Verify model cost tracking

After making changes, run a mission and check `agent_runs` in Supabase. The `model_name` column should now show:

| Agent | 預期 model_name |
|-------|----------------|
| market_review (GPT) | `gpt-4o` |
| portfolio_review (GPT) | `gpt-4o` |
| mission_analysis (GPT) | `gpt-4o` |
| market_scan (GPT) | `gpt-4o` |
| team_leader (GPT) | `gpt-4o` |
| division_manager (GPT) | `gpt-5.5`（從 DB 來，不變）|
| committee | `gpt-5.5`（從 DB 來，不變）|
| market_review (Claude) | `claude-haiku-4-5-20251001` |
| portfolio_review (Claude) | `claude-haiku-4-5-20251001` |
| mission_analysis (Claude) | `claude-haiku-4-5-20251001` |
| market_scan (Claude) | `claude-haiku-4-5-20251001` |
| team_leader (Claude) | `claude-sonnet-4-6` |
| division_manager (Claude) | `claude-sonnet-4-6`（從 DB 來，不變）|

---

## Cost estimate comparison

假設每個 agent 平均 3000 input tokens + 1000 output tokens：

| 階段 | 數量 | 舊費用 | 新費用 | 節省 |
|------|------|--------|--------|------|
| GPT 葉代理人 | 20× | $0.70 | $0.35 | $0.35 |
| GPT 團隊領導 | 5× | $0.18 | $0.09 | $0.09 |
| GPT Division Manager | 1× | $0.07 | $0.07 | — |
| GPT 委員會 | 1× | $0.07 | $0.07 | — |
| Claude 葉代理人 | 20× | $0.38 | $0.10 | $0.28 |
| Claude 團隊領導 | 5× | $0.09 | $0.09 | — |
| Claude Division Manager | 1× | $0.05 | $0.05 | — |
| validateOrRepair（偶發）| ~5× | $0.15 | $0.01 | $0.14 |
| **合計** | | **~$1.69** | **~$0.83** | **~$0.86 (51%)** |

---

## Verification

1. `npx tsc --noEmit` — no errors
2. Run a mission
3. Check Supabase `agent_runs` table — `model_name` column should reflect the tier above
4. Check `estimated_cost_usd` — total per mission should drop noticeably
5. Check analysis quality in team reports — leaf agents should still produce coherent analysis

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/pipeline/team.ts` | Add tier constants + `getLeafAgentModel()` + `getTeamLeaderModel()` + `getRepairModel()`, update all `callModel` and `validateOrRepair` calls |
| `src/lib/analysis/pipeline/division.ts` | Add `getRepairModel()`, update `validateOrRepair` call only |
| `src/lib/analysis/pipeline/committee.ts` | Add `getRepairModel()`, update `validateOrRepair` call only |
