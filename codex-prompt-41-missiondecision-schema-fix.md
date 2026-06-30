# Codex Prompt 41 — Fix missionDecision JSON Schema (nullable)

## Problem

In `src/lib/analysis/schemas.ts`, the `DIVISION_DECISION_JSON_SCHEMA_OBJ` has:

```ts
missionDecision: { type: "object" },
```

But the division-manager prompt says:
> 若所有 team 的 missionAnalysis 均為 null（日常分析模式），將 missionDecision 欄位輸出為 null。

This creates a conflict for Anthropic tool_use: the schema requires `missionDecision` to be an object, but the model is told to output `null` in daily (non-mission) analysis. The model cannot comply with both instructions simultaneously.

Compare with the team-level schema which already handles this correctly:
```ts
missionAnalysis: { type: ["object", "null"] },
```

## Fix — `src/lib/analysis/schemas.ts`

In `DIVISION_DECISION_JSON_SCHEMA_OBJ`, make two changes:

### Change 1 — Allow null in the type

```ts
// Before:
missionDecision: { type: "object" },

// After:
missionDecision: { type: ["object", "null"] },
```

### Change 2 — Remove missionDecision from required array

```ts
// Before:
required: ["division", "divisionManager", "marketSummary", "portfolioActions", "missionDecision", "topRecommendations", "confidence", "supportingReasons", "opposingReasons", "supportingTeams", "opposingTeams", "internalDisagreements", "decisionAction"]

// After:
required: ["division", "divisionManager", "marketSummary", "portfolioActions", "topRecommendations", "confidence", "supportingReasons", "opposingReasons", "supportingTeams", "opposingTeams", "internalDisagreements", "decisionAction"]
```

## Why

- `type: ["object", "null"]` matches the team-level pattern already used for `missionAnalysis`
- Removing from `required` lets Anthropic's tool_use accept the field being absent or null
- OpenAI with `strict: false` already tolerates null; this change just makes Anthropic consistent
- No other files need changes — this is the only place the schema object is defined

## What does NOT change

- `TEAM_REPORT_JSON_SCHEMA_OBJ` — already correct (`type: ["object", "null"]`)
- `AGENT_OUTPUT_JSON_SCHEMA_OBJ` — no missionDecision field
- `COMMITTEE_DECISION_JSON_SCHEMA_OBJ` — no missionDecision field
- The Zod schema (`DivisionDecisionSchema`) — `FlexibleRecordSchema` already accepts `{}` or null
- The division-manager prompt — already correct, no changes needed
