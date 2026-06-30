# Codex Prompt 39 — Structured Output + Max Teams 5 + gpt-4o-mini Leaf

## Background

目前 `validateOrRepair` 在 JSON parse 失敗時會多呼叫一次 model，這是 80 calls 的主要來源之一。目標是：

1. **OpenAI**：改用 Structured Output API（`json_schema` response_format），保證輸出合法 JSON
2. **Anthropic**：改用 tool_use 強制結構化輸出，保證合法 JSON
3. 兩側都改之後，`validateOrRepair` 在正常情況不會觸發（仍保留作最後防線）
4. `ANALYSIS_MAX_TEAMS_PER_DIVISION` 預設值從 2 改為 5
5. Leaf agents 的 OpenAI model 改為 gpt-4o-mini

---

## Fix 1 — 在 schemas.ts 新增 JSON Schema 物件

在 `src/lib/analysis/schemas.ts` 的底部，新增以下 JSON Schema 物件（供 Structured Output / tool_use 使用）。這些是手動定義的 JSON Schema，不使用 zod-to-json-schema：

```ts
// ─── JSON Schema objects for Structured Output API ───────────────────────────

export const AGENT_OUTPUT_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    summary: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "object" } },
    risks: { type: "array", items: { type: "string" } },
    dataQualityNotes: { type: "array", items: { type: "string" } },
    confidence: { type: "number" }
  },
  required: ["summary", "observations", "recommendations", "risks", "dataQualityNotes", "confidence"]
} as const;

export const TEAM_REPORT_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    teamName: { type: "string" },
    date: { type: "string" },
    leader: { type: "string" },
    marketView: {
      type: "object",
      properties: {
        summary: { type: "string" },
        marketBias: { type: "string" },
        strongSectors: { type: "array", items: { type: "string" } },
        weakSectors: { type: "array", items: { type: "string" } },
        riskLevel: { type: "string" },
        confidence: { type: "number" }
      },
      required: ["summary", "marketBias", "strongSectors", "weakSectors", "riskLevel", "confidence"]
    },
    portfolioReview: { type: "array", items: { type: "object" } },
    missionAnalysis: { type: ["object", "null"] },
    marketScanRecommendations: { type: "array", items: { type: "object" } },
    finalTeamView: {
      type: "object",
      properties: {
        summary: { type: "string" },
        mostImportantAction: { type: "string" },
        confidence: { type: "number" }
      },
      required: ["summary", "mostImportantAction", "confidence"]
    }
  },
  required: ["teamName", "date", "leader", "marketView", "portfolioReview", "marketScanRecommendations", "finalTeamView"]
} as const;

export const DIVISION_DECISION_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    division: { type: "string" },
    divisionManager: { type: "string" },
    marketSummary: { type: "string" },
    portfolioActions: { type: "array", items: { type: "object" } },
    missionDecision: { type: "object" },
    topRecommendations: { type: "array", items: { type: "object" } },
    confidence: { type: "number" },
    supportingReasons: { type: "array", items: { type: "string" } },
    opposingReasons: { type: "array", items: { type: "string" } },
    supportingTeams: { type: "array", items: { type: "string" } },
    opposingTeams: { type: "array", items: { type: "string" } },
    internalDisagreements: { type: "array", items: { type: "string" } },
    decisionAction: { type: "string" }
  },
  required: ["division", "divisionManager", "marketSummary", "portfolioActions", "missionDecision", "topRecommendations", "confidence", "supportingReasons", "opposingReasons", "supportingTeams", "opposingTeams", "internalDisagreements", "decisionAction"]
} as const;

export const COMMITTEE_DECISION_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    finalAction: { type: "string" },
    actionType: { type: "string" },
    consensusLevel: { type: "string" },
    divisionConclusions: { type: "object" },
    agreements: { type: "array", items: { type: "string" } },
    disagreements: { type: "array", items: { type: "string" } },
    finalBuyZone: { type: "string" },
    finalTargetPrice: { type: "string" },
    finalStopLoss: { type: "string" },
    finalPositionSize: { type: "string" },
    finalRecommendations: { type: "array", items: { type: "object" } },
    confidence: { type: "number" },
    isActionAllowed: { type: "boolean" },
    reason: { type: "string" },
    mostConservativeDivision: { type: "string" },
    mostAggressiveDivision: { type: "string" },
    whatCouldChangeDecision: { type: "array", items: { type: "string" } }
  },
  required: ["finalAction", "actionType", "consensusLevel", "divisionConclusions", "agreements", "disagreements", "finalBuyZone", "finalTargetPrice", "finalStopLoss", "finalPositionSize", "finalRecommendations", "confidence", "isActionAllowed", "reason", "mostConservativeDivision", "mostAggressiveDivision", "whatCouldChangeDecision"]
} as const;
```

---

## Fix 2 — 更新 `callModel()` 支援 Structured Output

**File:** `src/lib/analysis/pipeline/model.ts`

### 2a — 新增 `outputSchema` 參數

```ts
export async function callModel(params: {
  provider: string;
  model: string;
  prompt: string;
  budget?: { ... };
  maxOutputTokens?: number;
  outputSchema?: object;   // NEW — JSON Schema object for structured output
}): Promise<ModelCallResult>
```

### 2b — OpenAI 分支：改用 json_schema

當 `outputSchema` 存在時，使用 Structured Output。注意 `strict: false` 因為我們的 schema 含有 open-ended object fields（FlexibleRecord）：

```ts
if (params.provider === "OpenAI") {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const responseFormat = params.outputSchema
    ? {
        type: "json_schema" as const,
        json_schema: {
          name: "analysis_output",
          strict: false,
          schema: params.outputSchema
        }
      }
    : params.prompt.includes("---JSON_START---")
      ? undefined
      : { type: "json_object" as const };

  const response = await client.chat.completions.create({
    model: params.model,
    messages: [{ role: "user", content: params.prompt }],
    ...(responseFormat ? { response_format: responseFormat } : {}),
    max_completion_tokens: outputLimit
  });

  // ... rest unchanged
}
```

### 2c — Anthropic 分支：改用 tool_use

當 `outputSchema` 存在時，用 tool_use 強制結構化輸出。Response 的 tool_use block 的 `input` 欄位已經是 parsed object，stringify 後作為 text 回傳（讓後續 validateOrRepair 的 parseJson 正常運作）：

```ts
if (params.provider === "Anthropic") {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  if (params.outputSchema) {
    const response = await client.messages.create({
      model: params.model,
      max_tokens: outputLimit,
      tools: [
        {
          name: "analysis_output",
          description: "Output the structured analysis result",
          input_schema: params.outputSchema as Anthropic.Tool["input_schema"]
        }
      ],
      tool_choice: { type: "tool", name: "analysis_output" },
      messages: [{ role: "user", content: params.prompt }]
    });

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const text = toolBlock ? JSON.stringify(toolBlock.input) : "{}";
    const promptTokens = response.usage.input_tokens ?? 0;
    const completionTokens = response.usage.output_tokens ?? 0;

    return {
      text,
      promptTokens,
      completionTokens,
      estimatedCostUsd: estimateCostUsd(params.model, promptTokens, completionTokens),
      tokenCount: promptTokens + completionTokens
    };
  }

  // existing non-tool path unchanged
  const response = await client.messages.create({
    model: params.model,
    max_tokens: outputLimit,
    messages: [{ role: "user", content: params.prompt }]
  });
  // ... rest unchanged
}
```

---

## Fix 3 — 各呼叫點傳入 outputSchema

**File:** `src/lib/analysis/pipeline/team.ts`

Import 新的 JSON Schema 物件：

```ts
import {
  AGENT_OUTPUT_JSON_SCHEMA_OBJ,
  TEAM_REPORT_JSON_SCHEMA_OBJ,
  // ...
} from "@/lib/analysis/schemas";
```

在 leaf agent 的 `callModel` 呼叫加上 `outputSchema`：

```ts
const modelResult = await callModel({
  provider: params.division.model_provider,
  model: getLeafAgentModel(params.division.model_name),
  prompt,
  outputSchema: AGENT_OUTPUT_JSON_SCHEMA_OBJ,   // NEW
  maxOutputTokens: 1500,
  budget: { ... }
});
```

在 team leader 的 `callModel` 呼叫加上 `outputSchema`：

```ts
const leaderResult = await callModel({
  provider: params.division.model_provider,
  model: getTeamLeaderModel(params.division.model_name),
  prompt: leaderPrompt,
  outputSchema: TEAM_REPORT_JSON_SCHEMA_OBJ,   // NEW
  maxOutputTokens: 2500,
  budget: { ... }
});
```

**File:** `src/lib/analysis/pipeline/division.ts`

```ts
const modelResult = await callModel({
  provider: params.division.model_provider,
  model: params.division.model_name,
  prompt,
  outputSchema: DIVISION_DECISION_JSON_SCHEMA_OBJ,   // NEW
  maxOutputTokens: 3500,
  budget: { ... }
});
```

**File:** `src/lib/analysis/pipeline/committee.ts`

```ts
const modelResult = await callModel({
  provider: model.model_provider,
  model: committeeModel,
  prompt,
  outputSchema: COMMITTEE_DECISION_JSON_SCHEMA_OBJ,   // NEW
  maxOutputTokens: 4000,
  budget: { ... }
});
```

---

## Fix 4 — ANALYSIS_MAX_TEAMS_PER_DIVISION 預設值改為 5

`maxTeamsPerDivision()` 在兩個地方各自定義，**兩個都要改**：

**File 1:** `src/lib/analysis/pipeline/division.ts`

```ts
// Before:
function maxTeamsPerDivision() {
  return Math.max(1, Math.round(envNumber("ANALYSIS_MAX_TEAMS_PER_DIVISION", 2)));
}

// After:
function maxTeamsPerDivision() {
  return Math.max(1, Math.round(envNumber("ANALYSIS_MAX_TEAMS_PER_DIVISION", 5)));
}
```

**File 2:** `src/app/analysis/daily/page.tsx`（進度視窗用來計算 expectedTeamReports）

```ts
// Before:
function maxTeamsPerDivision() {
  return Math.max(1, Math.round(envNumber("ANALYSIS_MAX_TEAMS_PER_DIVISION", 2)));
}

// After:
function maxTeamsPerDivision() {
  return Math.max(1, Math.round(envNumber("ANALYSIS_MAX_TEAMS_PER_DIVISION", 5)));
}
```

兩個同步改，否則進度視窗預期 4 份 team 報告，但實際產出 10 份，進度條永遠顯示異常。

---

## Fix 5 — Leaf agents 改用 gpt-4o-mini

**File:** `src/lib/analysis/pipeline/team.ts`

```ts
// Before:
const LEAF_AGENT_MODEL_MAP: Record<string, string> = {
  "gpt-5.5": "gpt-4o",
  "gpt-5": "gpt-4o",
  "gpt-4o": "gpt-4o",
  "claude-sonnet-4-6": "claude-haiku-4-5-20251001",
  "claude-sonnet-latest": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5": "claude-haiku-4-5-20251001"
};

// After:
const LEAF_AGENT_MODEL_MAP: Record<string, string> = {
  "gpt-5.5": "gpt-4o-mini",
  "gpt-5": "gpt-4o-mini",
  "gpt-4o": "gpt-4o-mini",
  "claude-sonnet-4-6": "claude-haiku-4-5-20251001",
  "claude-sonnet-latest": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5": "claude-haiku-4-5-20251001"
};
```

---

## 預期效果

| 問題 | 改前 | 改後 |
|------|------|------|
| JSON parse 失敗 repair calls | 每次失敗 +1 call | 結構化輸出，幾乎不觸發 |
| OpenAI leaf model | gpt-4o ($5/$15) | gpt-4o-mini ($0.15/$0.60) |
| 每次跑幾個 team | 2（env 預設） | 5（全跑） |
| 估計每次費用 | >$3（超限） | ~$0.80–1.20 |

## 注意事項

- `validateOrRepair` 保留不動，仍作最後防線。改動後在正常情況下不會觸發
- Anthropic tool_use 的 `input_schema` 型別要 cast 為 `Anthropic.Tool["input_schema"]`
- OpenAI `strict: false` 是刻意的：我們的 schema 含有 open-ended object fields，strict: true 不相容
- 若某個 call site 不想用 structured output（如 repair call 本身），不傳 `outputSchema` 即可，走原有路徑
