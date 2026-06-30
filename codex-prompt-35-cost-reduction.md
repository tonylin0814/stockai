# Codex Prompt 35 — Cost Reduction: Analysis Pipeline

## Problem

A single daily analysis run exceeds $3 USD and triggers the cost limit at ~80 API calls. The architecture has:

- **2 divisions** (GPT Division using `gpt-5.5` → mapped to `gpt-4o`, Claude Division using `claude-sonnet-4-6`)
- **5 teams per division** (基本面品質、技術量價、總經產業、事件催化、風險控管)

This means per run:
```
5 teams × 2 divisions = 10 teams
Each team: 4 leaf agent calls + 1 team leader = 5 calls
10 teams × 5 = 50 calls
+ 2 division manager calls
+ 1 committee call
+ validateOrRepair repair calls on parse failures
= ~53–80 API calls total
```

Root causes:

1. **gpt-4o used for ALL OpenAI leaf agents** — `LEAF_AGENT_MODEL_MAP` maps `gpt-5.5`/`gpt-4o` → `gpt-4o` ($5/$15 per 1M tokens). With 5 teams × 4 calls = 20 leaf calls at gpt-4o prices with large prompts, GPT Division alone costs ~$2–3.

2. **4 separate leaf agent calls per team** — each of the 4 agents (marketReview, portfolioReview, missionAnalysis, marketScan) receives the FULL data package. Same large context sent 20 times per division.

3. **`max_tokens: 16000` hardcoded for every call** — leaf agents only output ~500-1000 tokens of structured JSON but every call reserves 16K output tokens.

4. **Full data package sent to every single agent** — marketReview doesn't need individual stock fundamentals; marketScan doesn't need portfolio history. Each prompt inflates input tokens unnecessarily.

5. **missionAnalysis runs even when there's no active mission** — a wasted call in most daily runs.

---

## Fix 1 — Switch gpt-4o leaf agents to gpt-4o-mini

**File:** `src/lib/analysis/pipeline/team.ts`

Change `LEAF_AGENT_MODEL_MAP` so OpenAI's leaf model is `gpt-4o-mini`, not `gpt-4o`:

```ts
const LEAF_AGENT_MODEL_MAP: Record<string, string> = {
  "gpt-5.5": "gpt-4o-mini",   // was "gpt-4o"
  "gpt-5": "gpt-4o-mini",     // was "gpt-4o"
  "gpt-4o": "gpt-4o-mini",    // was "gpt-4o"
  "claude-sonnet-4-6": "claude-haiku-4-5-20251001",
  "claude-sonnet-latest": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5": "claude-haiku-4-5-20251001"
};
```

Also update `MODEL_COST_PER_1M` in both `team.ts` and `model.ts` to add gpt-4o-mini if missing:

```ts
"gpt-4o-mini": { input: 0.15, output: 0.60 },
```

**Expected saving: ~33× reduction on all leaf agent input cost for GPT division.**

---

## Fix 2 — Cap max_tokens per call type instead of always using 16000

**Files:** `src/lib/analysis/pipeline/model.ts`, `src/lib/analysis/pipeline/team.ts`

Add an optional `maxTokens` parameter to `callModel()`:

```ts
export async function callModel(params: {
  provider: string;
  model: string;
  prompt: string;
  maxTokens?: number;   // NEW — defaults to 4096 if omitted
  budget?: { ... };
}): Promise<ModelCallResult> {
```

In the OpenAI branch:
```ts
max_completion_tokens: params.maxTokens ?? 4096,
```

In the Anthropic branch:
```ts
max_tokens: params.maxTokens ?? 4096,
```

Then pass appropriate limits at each call site:

| Call type | Recommended maxTokens |
|-----------|----------------------|
| Leaf agent (marketReview, portfolioReview, marketScan) | `1500` |
| missionAnalysis leaf agent | `2000` |
| Team leader | `2500` |
| Division manager | `3500` |
| Committee | `4000` |
| validateOrRepair (repair calls) | `2000` |

**Expected saving: 4-10× reduction in output token cost.**

---

## Fix 3 — Skip missionAnalysis when there is no active mission

**File:** `src/lib/analysis/pipeline/team.ts`

The `agentSteps` array always runs all 4 steps including `missionAnalysis`. But if there's no active mission (no `missionId` in params and no mission in the data package), this is a wasted call.

Add a filter before the loop:

```ts
const stepsToRun = agentSteps.filter((step) => {
  if (step.promptKey === "missionAnalysis") {
    // Only run mission analysis if there's an active mission
    return Boolean(params.missionId);
  }
  return true;
});

for (const step of stepsToRun) {
  // existing loop body — no other changes
}
```

**Expected saving: removes 1 of 4 leaf calls per team when no mission is active (~25% fewer leaf calls in typical daily runs).**

---

## Fix 4 — Trim the data package sent to each leaf agent prompt

**Files:** `src/lib/analysis/prompts/market-review.ts`, `src/lib/analysis/prompts/portfolio-review.ts`, `src/lib/analysis/prompts/market-scan.ts`, `src/lib/analysis/prompts/mission-analysis.ts`

Currently each prompt builder receives the entire `DailyDataPackage` and likely includes everything in the prompt string. Each agent only needs a subset:

| Agent | What it actually needs |
|-------|----------------------|
| `marketReview` | `marketSnapshot`, `upcomingEarnings`, `dataQualitySummary` |
| `portfolioReview` | `portfolio` (quotes + technicals only, not full news), `watchlist` (same), `marketSnapshot`, `decisionMemory` |
| `marketScan` | `twScanUniverse` (trimmed to top 20 by volume), `marketSnapshot` |
| `missionAnalysis` | `portfolio`, `watchlist`, `marketSnapshot` |

For each prompt builder, add a data-trimming step at the top:

**Example for `portfolioReview`** — limit news to 2 items per stock instead of 5, and strip fields that aren't used in the prompt:

```ts
export function buildPortfolioReviewPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
): string {
  // Trim to reduce token count
  const trimmedPortfolio = dataPackage.portfolio.map((item) => ({
    ...item,
    news: item.news.slice(0, 2),   // was up to 5
    fundamentals: item.fundamentals
      ? {
          pe: item.fundamentals.pe,
          pb: item.fundamentals.pb,
          eps: item.fundamentals.eps,
          marketCap: item.fundamentals.marketCap,
          source: item.fundamentals.source,
          qualityState: item.fundamentals.qualityState
        }
      : null
  }));
  // ... rest of prompt using trimmedPortfolio
}
```

**Example for `marketScan`** — limit TW scan universe to top 20 stocks by volume or momentum:

```ts
export function buildMarketScanPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
): string {
  // Only pass the most interesting candidates to save tokens
  const topCandidates = [...dataPackage.twScanUniverse]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 20);
  // ... use topCandidates instead of full twScanUniverse
}
```

**Expected saving: 30-50% reduction in input tokens per prompt.**

---

## Fix 5 — Merge 4 leaf agents into 1 combined call per team (optional, largest saving)

This is the highest-impact change but also the largest refactor. Instead of 4 sequential leaf calls per team, make **1 single call** that covers all four perspectives simultaneously.

**File:** `src/lib/analysis/pipeline/team.ts`

Replace the `for (const step of stepsToRun)` loop with a single combined prompt call:

```ts
// NEW: build a single combined prompt that asks for all four analyses at once
function buildCombinedLeafPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage,
  includeMission: boolean
): string {
  // Combine what was 4 prompts into 1, asking the model to return a JSON object
  // with keys: marketReview, portfolioReview, marketScan, missionAnalysis (optional)
  return `You are ${identity.agentName} from ${identity.teamName}.
  
Analyze the following market data and return a JSON object with these sections:

1. "marketReview": market conditions analysis
2. "portfolioReview": portfolio and watchlist assessment  
3. "marketScan": scan of market opportunities
${includeMission ? '4. "missionAnalysis": mission-specific analysis' : ""}

[market data here — same trimmed data as Fix 4]

Return only valid JSON matching the CombinedLeafOutput schema.`;
}

// Then in runTeamPipeline, replace the loop:
const combinedPrompt = buildCombinedLeafPrompt(identity, params.dataPackage, Boolean(params.missionId));
const leafResult = await callModel({
  provider: params.division.model_provider,
  model: getLeafAgentModel(params.division.model_name),
  prompt: combinedPrompt,
  maxTokens: params.missionId ? 4000 : 3000,
  budget: { ... }
});

// Parse combined output and split into agentOutputs
const combinedOutput = CombinedLeafOutputSchema.parse(parseJson(leafResult.text));
agentOutputs.marketReview = combinedOutput.marketReview;
agentOutputs.portfolioReview = combinedOutput.portfolioReview;
agentOutputs.marketScan = combinedOutput.marketScan;
if (params.missionId) agentOutputs.missionAnalysis = combinedOutput.missionAnalysis;
```

You'll need to create `CombinedLeafOutputSchema` in `schemas.ts` that wraps the four individual `AgentOutputSchema` sections.

**Expected saving: reduces 4 leaf calls to 1 = 75% fewer leaf agent API calls = largest single cost reduction.**

---

## Summary of Expected Savings

Actual scale: 2 divisions × 5 teams = 10 teams, ~53–80 API calls per run.

| Fix | Before | After | Saving |
|-----|--------|-------|--------|
| gpt-4o → gpt-4o-mini for leaf | 20 leaf × gpt-4o ≈ $2.00+ | 20 leaf × gpt-4o-mini ≈ $0.06 | ~97% on GPT leaf cost |
| max_tokens 16000 → per-type cap | 16K reserved per call | 1.5K–4K per call | ~75–90% output cost |
| Skip missionAnalysis | 10 mission calls/run | 0 in daily runs | -10 calls |
| Trim data package | ~15K tokens/prompt | ~6K tokens/prompt | -60% input |
| Merge 4 leaves → 1 (Fix 5) | 40 leaf calls | 10 combined calls | -75% leaf calls |

**Without Fix 5**: ~$0.40–0.60 per run (Fixes 1–4 only, 2–3 hours work)
**With Fix 5**: ~$0.15–0.25 per run (full refactor, 1 day work)

Start with Fix 1 and Fix 2 — they alone should bring you under $0.50 per run.

## Implementation Order

Do these in order — each one is independently deployable and testable:

1. Fix 1 (gpt-4o-mini) — 5 min change, immediate impact
2. Fix 2 (max_tokens caps) — 30 min, immediate impact  
3. Fix 3 (skip missionAnalysis) — 15 min, easy
4. Fix 4 (trim data package) — 1-2 hours, needs careful testing
5. Fix 5 (merge leaves) — 3-4 hours, biggest savings, biggest refactor
