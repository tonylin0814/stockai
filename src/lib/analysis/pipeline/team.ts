import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { z } from "zod";
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { enforceConfidenceCap } from "@/lib/analysis/pipeline/model";
import {
  AgentOutputSchema,
  AGENT_OUTPUT_JSON_SCHEMA,
  TeamReportSchema,
  TEAM_REPORT_JSON_SCHEMA,
  type AgentOutput,
  type TeamReport
} from "@/lib/analysis/schemas";
import { buildMarketReviewPrompt } from "@/lib/analysis/prompts/market-review";
import { buildPortfolioReviewPrompt } from "@/lib/analysis/prompts/portfolio-review";
import { buildMissionAnalysisPrompt } from "@/lib/analysis/prompts/mission-analysis";
import { buildMarketScanPrompt } from "@/lib/analysis/prompts/market-scan";
import { buildTeamLeaderPrompt } from "@/lib/analysis/prompts/team-leader";
import { PROMPT_VERSIONS } from "@/lib/analysis/prompts/versions";
import type { PromptIdentity } from "@/lib/analysis/prompts/common";
import { assertAnalysisBudget } from "@/lib/analysis/cost-guard";
import type { DataQualityState } from "@/lib/market-data/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type DivisionTeam = {
  id: string;
  division_id: string;
  team_name: string;
  team_leader: string;
  team_role: string | null;
  sort_order: number;
  is_enabled: boolean;
};

export type Division = {
  id: string;
  name: string;
  manager_name: string;
  model_provider: string;
  model_name: string;
  brain_description: string | null;
  is_enabled: boolean;
  participates_in_committee: boolean;
  sort_order: number;
};

export type TeamReportResult =
  | {
      status: "completed";
      report: TeamReport;
      teamReportId: string;
    }
  | {
      status: "failed";
      error: string;
      report: null;
      teamReportId: null;
    };

type AgentStep = {
  promptKey: keyof typeof PROMPT_VERSIONS;
  agentType: string;
  buildPrompt: (identity: PromptIdentity, dataPackage: DailyDataPackage) => string;
};

type ModelCallResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  tokenCount: number;
};

const LEAF_AGENT_MODEL_MAP: Record<string, string> = {
  "gpt-5.5": "gpt-4o",
  "gpt-5": "gpt-4o",
  "gpt-4o": "gpt-4o",
  "claude-sonnet-4-6": "claude-haiku-4-5-20251001",
  "claude-sonnet-latest": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5": "claude-haiku-4-5-20251001"
};

const TEAM_LEADER_MODEL_MAP: Record<string, string> = {
  "gpt-5.5": "gpt-4o",
  "gpt-5": "gpt-4o",
  "gpt-4o": "gpt-4o",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-sonnet-latest": "claude-sonnet-latest",
  "claude-sonnet-4-5": "claude-sonnet-4-5"
};

const REPAIR_MODEL_MAP: Record<string, string> = {
  OpenAI: "gpt-4o-mini",
  Anthropic: "claude-haiku-4-5-20251001"
};

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

const agentSteps: AgentStep[] = [
  {
    promptKey: "marketReview",
    agentType: "market_review",
    buildPrompt: buildMarketReviewPrompt
  },
  {
    promptKey: "portfolioReview",
    agentType: "portfolio_review",
    buildPrompt: buildPortfolioReviewPrompt
  },
  {
    promptKey: "missionAnalysis",
    agentType: "mission_analysis",
    buildPrompt: buildMissionAnalysisPrompt
  },
  {
    promptKey: "marketScan",
    agentType: "market_scan",
    buildPrompt: buildMarketScanPrompt
  }
];

function inputSummary(prompt: string) {
  return prompt.replace(/\s+/g, " ").slice(0, 200);
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonFromOutput(text: string) {
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

function parseJson(text: string): unknown {
  return JSON.parse(extractJsonFromOutput(text));
}

function getWorstQualityState(dataPackage: DailyDataPackage): DataQualityState {
  const qualityCaps: Record<DataQualityState, number> = {
    fresh: 90,
    delayed: 75,
    stale: 55,
    missing: 40,
    conflicting: 50
  };
  const states: DataQualityState[] = [
    ...dataPackage.portfolio.map((item) => item.quote.qualityState),
    ...dataPackage.watchlist.map((item) => item.quote.qualityState),
    dataPackage.marketSnapshot.taiex.qualityState,
    dataPackage.marketSnapshot.sp500.qualityState,
    dataPackage.marketSnapshot.nasdaq.qualityState,
    dataPackage.marketSnapshot.dow.qualityState,
    dataPackage.marketSnapshot.vix.qualityState,
    ...dataPackage.portfolio
      .map((item) => item.fundamentals?.qualityState)
      .filter((state): state is DataQualityState => Boolean(state)),
    ...dataPackage.watchlist
      .map((item) => item.fundamentals?.qualityState)
      .filter((state): state is DataQualityState => Boolean(state))
  ];

  return states.reduce<DataQualityState>(
    (worst, state) => (qualityCaps[state] < qualityCaps[worst] ? state : worst),
    "fresh"
  );
}

function getMinDaysUntilEarnings(dataPackage: DailyDataPackage) {
  const days = (dataPackage.upcomingEarnings ?? [])
    .map((event) => event.daysUntil)
    .filter((value) => Number.isFinite(value));

  return days.length ? Math.min(...days) : null;
}

function hasFundamentalsAndNewsMissing(dataPackage: DailyDataPackage) {
  return [...dataPackage.portfolio, ...dataPackage.watchlist].some(
    (item) =>
      (!item.fundamentals || item.fundamentals.qualityState === "missing") &&
      item.news.length === 0
  );
}

function confidenceContext(dataPackage: DailyDataPackage) {
  return {
    worstQualityState: getWorstQualityState(dataPackage),
    daysUntilEarnings: getMinDaysUntilEarnings(dataPackage),
    fundamentalsAndNewsMissing: hasFundamentalsAndNewsMissing(dataPackage)
  };
}

function capConfidence(value: number, dataPackage: DailyDataPackage) {
  return enforceConfidenceCap(value, confidenceContext(dataPackage));
}

function capRecordConfidence<T extends Record<string, unknown>>(
  record: T,
  dataPackage: DailyDataPackage
): T {
  if (typeof record.confidence !== "number") {
    return record;
  }

  return {
    ...record,
    confidence: capConfidence(record.confidence, dataPackage)
  };
}

function capAgentOutput(output: AgentOutput, dataPackage: DailyDataPackage): AgentOutput {
  return {
    ...output,
    confidence: capConfidence(output.confidence, dataPackage),
    recommendations: output.recommendations.map((recommendation) =>
      capRecordConfidence(recommendation, dataPackage)
    )
  };
}

function capTeamReport(report: TeamReport, dataPackage: DailyDataPackage): TeamReport {
  return {
    ...report,
    marketView: {
      ...report.marketView,
      confidence: capConfidence(report.marketView.confidence, dataPackage)
    },
    portfolioReview: report.portfolioReview.map((item) => ({
      ...item,
      confidence: capConfidence(item.confidence, dataPackage)
    })),
    missionAnalysis: {
      ...report.missionAnalysis,
      confidence: capConfidence(report.missionAnalysis.confidence, dataPackage)
    },
    marketScanRecommendations: report.marketScanRecommendations.map((item) => ({
      ...item,
      confidence: capConfidence(item.confidence, dataPackage)
    })),
    finalTeamView: {
      ...report.finalTeamView,
      confidence: capConfidence(report.finalTeamView.confidence, dataPackage)
    }
  };
}

function getLeafAgentModel(divisionModel: string): string {
  return LEAF_AGENT_MODEL_MAP[divisionModel] ?? divisionModel;
}

function getTeamLeaderModel(divisionModel: string): string {
  return TEAM_LEADER_MODEL_MAP[divisionModel] ?? divisionModel;
}

function getRepairModel(provider: string): string {
  return REPAIR_MODEL_MAP[provider] ?? "gpt-4o-mini";
}

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_COST_PER_1M[model] ?? { input: 5, output: 20 };
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}

async function callModel(params: {
  provider: string;
  model: string;
  prompt: string;
  budget?: {
    userId: string;
    dailyRunId?: string | null;
    missionId?: string | null;
  };
}): Promise<ModelCallResult> {
  if (params.budget) {
    await assertAnalysisBudget(params.budget);
  }

  if (params.provider === "OpenAI") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [{ role: "user", content: params.prompt }],
      ...(params.prompt.includes("---JSON_START---")
        ? {}
        : { response_format: { type: "json_object" as const } }),
      max_completion_tokens: 16000
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

async function validateOrRepair<T>(params: {
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
    const repairPrompt = `The following text should be valid JSON matching this schema: ${params.schemaDescription}. Fix it and return only valid JSON: ${params.rawText}`;
    const repairResult = await callModel({
      provider: params.provider,
      model: params.model,
      prompt: repairPrompt,
      budget: params.budget
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

async function getFamilyId(userId: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", userId)
    .maybeSingle();

  return (data as { family_id?: string | null } | null)?.family_id ?? null;
}

async function getTeamAgentIds(teamId: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("team_agents")
    .select("id, agent_type")
    .eq("division_team_id", teamId);

  return new Map(
    ((data ?? []) as Array<{ id: string; agent_type: string }>).map((agent) => [
      agent.agent_type,
      agent.id
    ])
  );
}

async function saveAgentRun(params: {
  userId: string;
  dailyRunId?: string | null;
  missionId?: string;
  teamAgentId: string | null;
  provider: string;
  model: string;
  promptKey: keyof typeof PROMPT_VERSIONS;
  inputSummary: string;
  output: unknown;
  confidence: number | null;
  tokenCount: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  startedAt: string;
  completedAt: string;
  status: "completed" | "failed";
  errorMessage?: string;
}) {
  const supabase = createSupabaseServiceClient();
  await supabase.from("agent_runs").insert({
    user_id: params.userId,
    daily_run_id: params.dailyRunId,
    mission_id: params.missionId ?? null,
    team_agent_id: params.teamAgentId,
    status: params.status,
    model_provider: params.provider,
    model_name: params.model,
    prompt_key: params.promptKey,
    prompt_version: PROMPT_VERSIONS[params.promptKey],
    input_summary: params.inputSummary,
    output: params.output,
    confidence: params.confidence,
    token_count: params.tokenCount,
    prompt_tokens: params.promptTokens ?? null,
    completion_tokens: params.completionTokens ?? null,
    estimated_cost_usd: params.estimatedCostUsd ?? null,
    started_at: params.startedAt,
    completed_at: params.completedAt,
    error_message: params.errorMessage ?? null
  });
}

export async function runTeamPipeline(params: {
  team: DivisionTeam;
  division: Division;
  dataPackage: DailyDataPackage;
  dailyRunId?: string | null;
  userId: string;
  missionId?: string;
}): Promise<TeamReportResult> {
  const supabase = createSupabaseServiceClient();
  const identity: PromptIdentity = {
    agentName: params.team.team_leader,
    teamName: params.team.team_name,
    teamLeader: params.team.team_leader,
    divisionName: params.division.name,
    divisionManager: params.division.manager_name,
    teamRole: params.team.team_role
  };
  const teamAgentIds = await getTeamAgentIds(params.team.id);
  const agentOutputs: Partial<Record<AgentStep["promptKey"], AgentOutput>> = {};

  for (const step of agentSteps) {
    const prompt = step.buildPrompt(identity, params.dataPackage);
    const startedAt = new Date().toISOString();
    let tokenCount = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let estimatedCostUsd = 0;
    const leafModel = getLeafAgentModel(params.division.model_name);

    try {
      const modelResult = await callModel({
        provider: params.division.model_provider,
        model: leafModel,
        prompt,
        budget: {
          userId: params.userId,
          dailyRunId: params.dailyRunId,
          missionId: params.missionId
        }
      });
      tokenCount += modelResult.tokenCount;
      promptTokens += modelResult.promptTokens;
      completionTokens += modelResult.completionTokens;
      estimatedCostUsd += modelResult.estimatedCostUsd;
      const validation = await validateOrRepair({
        rawText: modelResult.text,
        schema: AgentOutputSchema,
        schemaDescription: AGENT_OUTPUT_JSON_SCHEMA,
        provider: params.division.model_provider,
        model: getRepairModel(params.division.model_provider),
        budget: {
          userId: params.userId,
          dailyRunId: params.dailyRunId,
          missionId: params.missionId
        }
      });
      tokenCount += validation.tokenCount;
      promptTokens += validation.promptTokens;
      completionTokens += validation.completionTokens;
      estimatedCostUsd += validation.estimatedCostUsd;
      const cappedOutput = capAgentOutput(validation.parsed, params.dataPackage);
      agentOutputs[step.promptKey] = cappedOutput;

      await saveAgentRun({
        userId: params.userId,
        dailyRunId: params.dailyRunId,
        missionId: params.missionId,
        teamAgentId: teamAgentIds.get(step.agentType) ?? null,
        provider: params.division.model_provider,
        model: leafModel,
        promptKey: step.promptKey,
        inputSummary: inputSummary(prompt),
        output: cappedOutput,
        confidence: cappedOutput.confidence,
        tokenCount,
        promptTokens,
        completionTokens,
        estimatedCostUsd,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "completed"
      });
    } catch (error) {
      await saveAgentRun({
        userId: params.userId,
        dailyRunId: params.dailyRunId,
        missionId: params.missionId,
        teamAgentId: teamAgentIds.get(step.agentType) ?? null,
        provider: params.division.model_provider,
        model: leafModel,
        promptKey: step.promptKey,
        inputSummary: inputSummary(prompt),
        output: {
          error: error instanceof Error ? error.message : "Unknown agent failure"
        },
        confidence: null,
        tokenCount,
        promptTokens,
        completionTokens,
        estimatedCostUsd,
        startedAt,
        completedAt: new Date().toISOString(),
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown agent failure"
      });
    }
  }

  const teamLeaderPrompt = buildTeamLeaderPrompt({
    identity,
    dataPackage: params.dataPackage,
    agentOutputs
  });
  const startedAt = new Date().toISOString();
  let tokenCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd = 0;
  const leaderModel = getTeamLeaderModel(params.division.model_name);

  try {
    const modelResult = await callModel({
      provider: params.division.model_provider,
      model: leaderModel,
      prompt: teamLeaderPrompt,
      budget: {
        userId: params.userId,
        dailyRunId: params.dailyRunId,
        missionId: params.missionId
      }
    });
    tokenCount += modelResult.tokenCount;
    promptTokens += modelResult.promptTokens;
    completionTokens += modelResult.completionTokens;
    estimatedCostUsd += modelResult.estimatedCostUsd;
    const validation = await validateOrRepair({
      rawText: modelResult.text,
      schema: TeamReportSchema,
      schemaDescription: TEAM_REPORT_JSON_SCHEMA,
      provider: params.division.model_provider,
      model: getRepairModel(params.division.model_provider),
      budget: {
        userId: params.userId,
        dailyRunId: params.dailyRunId,
        missionId: params.missionId
      }
    });
    tokenCount += validation.tokenCount;
    promptTokens += validation.promptTokens;
    completionTokens += validation.completionTokens;
    estimatedCostUsd += validation.estimatedCostUsd;
    const report = capTeamReport(validation.parsed, params.dataPackage);
    const familyId = await getFamilyId(params.userId);
    const { data, error } = await supabase
      .from("team_reports")
      .insert({
        user_id: params.userId,
        family_id: familyId,
    daily_run_id: params.dailyRunId ?? null,
        mission_id: params.missionId ?? null,
        division: params.division.name,
        team_name: report.teamName,
        team_leader: report.leader,
        model_provider: params.division.model_provider,
        model_name: params.division.model_name,
        report_type: params.missionId ? "mission" : "daily",
        market_view: report.marketView,
        portfolio_review: report.portfolioReview,
        mission_analysis: report.missionAnalysis,
        market_scan_recommendations: report.marketScanRecommendations,
        final_team_view: report.finalTeamView,
        confidence: report.finalTeamView.confidence
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to save team report");
    }

    await saveAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      teamAgentId: teamAgentIds.get("team_leader") ?? null,
      provider: params.division.model_provider,
      model: leaderModel,
      promptKey: "teamLeader",
      inputSummary: inputSummary(teamLeaderPrompt),
      output: report,
      confidence: report.finalTeamView.confidence,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "completed"
    });

    return {
      status: "completed",
      report,
      teamReportId: (data as { id: string }).id
    };
  } catch (error) {
    await saveAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      teamAgentId: teamAgentIds.get("team_leader") ?? null,
      provider: params.division.model_provider,
      model: leaderModel,
      promptKey: "teamLeader",
      inputSummary: inputSummary(teamLeaderPrompt),
      output: {
        error: error instanceof Error ? error.message : "Unknown team leader failure"
      },
      confidence: null,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown team leader failure"
    });

    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown team leader failure",
      report: null,
      teamReportId: null
    };
  }
}
