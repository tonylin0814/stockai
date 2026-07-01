import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { z } from "zod";
import { assertAnalysisBudget } from "@/lib/analysis/cost-guard";
import type { DataQualityState } from "@/lib/market-data/types";

const MODEL_COST_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 10, output: 40 },
  "gpt-5.5": { input: 10, output: 40 },
  "gpt-4o": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-latest": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 }
};

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function approximateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function maxOutputTokens() {
  return Math.round(envNumber("ANALYSIS_MAX_OUTPUT_TOKENS", 2500));
}

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_COST_PER_1M[model] ?? { input: 5, output: 20 };
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}

export type ModelCallResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  tokenCount: number;
};

export function inputSummary(prompt: string) {
  return prompt.replace(/\s+/g, " ").slice(0, 200);
}

export function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractJsonFromOutput(text: string) {
  const marker = "---JSON_START---";
  const markedIndex = text.lastIndexOf(marker);
  const candidate = markedIndex >= 0 ? text.slice(markedIndex + marker.length) : text;
  const stripped = stripJsonFence(candidate);
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1).trim();
  }

  return stripped;
}

export function parseJson(text: string): unknown {
  return JSON.parse(extractJsonFromOutput(text));
}

export function enforceConfidenceCap(
  confidence: number,
  context: {
    worstQualityState?: DataQualityState | null;
    daysUntilEarnings?: number | null;
    fundamentalsAndNewsMissing?: boolean;
  } = {}
) {
  const qualityCaps: Record<DataQualityState, number> = {
    fresh: 90,
    delayed: 75,
    stale: 55,
    missing: 40,
    conflicting: 50
  };
  let cap = context.worstQualityState ? qualityCaps[context.worstQualityState] : 90;

  if (context.fundamentalsAndNewsMissing) {
    cap = Math.min(cap, 50);
  }

  if (context.daysUntilEarnings !== null && context.daysUntilEarnings !== undefined) {
    if (context.daysUntilEarnings <= 7) {
      cap -= 10;
    } else if (context.daysUntilEarnings <= 14) {
      cap -= 5;
    }
  }

  return Math.max(0, Math.min(confidence, cap));
}

export async function callModel(params: {
  provider: string;
  model: string;
  prompt: string;
  budget?: {
    userId: string;
    dailyRunId?: string | null;
    missionId?: string | null;
  };
  maxOutputTokens?: number;
  outputSchema?: object;
}): Promise<ModelCallResult> {
  const outputLimit = Math.round(params.maxOutputTokens ?? maxOutputTokens());
  if (params.budget) {
    await assertAnalysisBudget({
      ...params.budget,
      projectedCostUsd: estimateCostUsd(params.model, approximateTokens(params.prompt), outputLimit)
    });
  }

  if (params.provider === "OpenAI") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const responseFormat = params.outputSchema
      ? {
          type: "json_schema" as const,
          json_schema: {
            name: "analysis_output",
            strict: false,
            schema: params.outputSchema as Record<string, unknown>
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
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    return {
      text: response.choices[0]?.message?.content ?? "{}",
      promptTokens,
      completionTokens,
      estimatedCostUsd: estimateCostUsd(params.model, promptTokens, completionTokens),
      tokenCount: promptTokens + completionTokens
    };
  }

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

    const response = await client.messages.create({
      model: params.model,
      max_tokens: outputLimit,
      messages: [{ role: "user", content: params.prompt }]
    });
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
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

  throw new Error(`Unsupported model provider: ${params.provider}`);
}

export async function validateOrRepair<T>(params: {
  rawText: string;
  schema: z.ZodType<T>;
  schemaDescription: string;
  provider: string;
  model: string;
  budget?: {
    userId: string;
    dailyRunId?: string | null;
    missionId?: string | null;
  };
}) {
  try {
    return {
      parsed: params.schema.parse(parseJson(params.rawText)),
      repaired: false,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      tokenCount: 0
    };
  } catch {
    const repairPrompt = [
      "Repair the following malformed JSON.",
      "Return exactly one complete JSON object and nothing else.",
      "Do not use markdown fences, comments, explanations, or trailing text.",
      "Close every string, array, and object. Remove invalid trailing commas.",
      "The repaired JSON must match this schema exactly:",
      params.schemaDescription,
      "Malformed JSON input:",
      params.rawText
    ].join("\n\n");
    const repairResult = await callModel({
      provider: params.provider,
      model: params.model,
      prompt: repairPrompt,
      budget: params.budget,
      maxOutputTokens: Math.min(2500, maxOutputTokens())
    });

    return {
      parsed: params.schema.parse(parseJson(repairResult.text)),
      repaired: true,
      promptTokens: repairResult.promptTokens,
      completionTokens: repairResult.completionTokens,
      estimatedCostUsd: repairResult.estimatedCostUsd,
      tokenCount: repairResult.tokenCount
    };
  }
}
