import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { z } from "zod";

const MODEL_COST_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 10, output: 40 },
  "gpt-5.5": { input: 10, output: 40 },
  "gpt-4o": { input: 5, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-latest": { input: 3, output: 15 }
};

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

export function parseJson(text: string): unknown {
  return JSON.parse(stripJsonFence(text));
}

export async function callModel(params: {
  provider: string;
  model: string;
  prompt: string;
}): Promise<ModelCallResult> {
  if (params.provider === "OpenAI") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [{ role: "user", content: params.prompt }],
      response_format: { type: "json_object" },
      max_tokens: 16000
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
    const response = await client.messages.create({
      model: params.model,
      max_tokens: 16000,
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
    const repairPrompt = `The following text should be valid JSON matching this schema: ${params.schemaDescription}. Fix it and return only valid JSON: ${params.rawText}`;
    const repairResult = await callModel({
      provider: params.provider,
      model: params.model,
      prompt: repairPrompt
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
