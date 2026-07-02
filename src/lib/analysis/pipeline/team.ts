import type { DailyDataPackage } from "@/lib/analysis/data-package";
import {
  callModel,
  enforceConfidenceCap,
  inputSummary,
  maxOutputTokens,
  parseJson,
  validateOrRepair
} from "@/lib/analysis/pipeline/model";
import {
  AgentOutputSchema,
  AGENT_OUTPUT_JSON_SCHEMA_OBJ,
  AGENT_OUTPUT_JSON_SCHEMA,
  TEAM_REPORT_JSON_SCHEMA_OBJ,
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

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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
    missionAnalysis: report.missionAnalysis
      ? {
          ...report.missionAnalysis,
          confidence: capConfidence(report.missionAnalysis.confidence, dataPackage)
        }
      : null,
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
  return process.env.CODEX_MODEL_NAME ?? "codex-local";
}

function getTeamLeaderModel(divisionModel: string): string {
  return process.env.CODEX_MODEL_NAME ?? "codex-local";
}

function getRepairModel(provider: string): string {
  return process.env.CODEX_MODEL_NAME ?? "codex-local";
}

async function getFamilyId(userId: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("stocks_profiles")
    .select("family_id")
    .eq("id", userId)
    .maybeSingle();

  return (data as { family_id?: string | null } | null)?.family_id ?? null;
}

async function getTeamAgentIds(teamId: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("stocks_team_agents")
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
  await supabase.from("stocks_agent_runs").insert({
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

async function getCompletedAgentOutput(params: {
  userId: string;
  dailyRunId?: string | null;
  teamAgentId: string | null;
  promptKey: keyof typeof PROMPT_VERSIONS;
  provider: string;
  model: string;
  inputSummary: string;
  dataPackage: DailyDataPackage;
}) {
  if (!params.dailyRunId) return null;

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("stocks_agent_runs")
    .select("output")
    .eq("user_id", params.userId)
    .eq("daily_run_id", params.dailyRunId)
    .eq("prompt_key", params.promptKey)
    .eq("model_provider", params.provider)
    .eq("model_name", params.model)
    .eq("input_summary", params.inputSummary)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(5);

  query = params.teamAgentId
    ? query.eq("team_agent_id", params.teamAgentId)
    : query.is("team_agent_id", null);

  const { data } = await query;

  for (const row of (data ?? []) as Array<{ output: unknown }>) {
    try {
      return capAgentOutput(AgentOutputSchema.parse(row.output), params.dataPackage);
    } catch {
      // Older output may no longer match the schema; try the next completed run.
    }
  }

  return null;
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

  // --- idempotency: skip if this team already has a completed report ---
  if (params.dailyRunId) {
    const { data: existingRow } = await supabase
      .from("stocks_team_reports")
      .select(
        "id, market_view, portfolio_review, mission_analysis, market_scan_recommendations, final_team_view, team_leader"
      )
      .eq("daily_run_id", params.dailyRunId)
      .eq("division", params.division.name)
      .eq("team_name", params.team.team_name)
      .maybeSingle();

    if (existingRow) {
      const row = existingRow as {
        id: string;
        market_view: unknown;
        portfolio_review: unknown;
        mission_analysis: unknown;
        market_scan_recommendations: unknown;
        final_team_view: unknown;
        team_leader: string;
      };

      try {
        const report = TeamReportSchema.parse({
          teamName: params.team.team_name,
          date: new Date().toISOString().slice(0, 10),
          leader: row.team_leader,
          marketView: row.market_view,
          portfolioReview: row.portfolio_review,
          missionAnalysis: row.mission_analysis ?? null,
          marketScanRecommendations: row.market_scan_recommendations,
          finalTeamView: row.final_team_view
        });

        return { status: "completed", report, teamReportId: row.id };
      } catch {
        // If stored data no longer matches the schema, fall through and re-run.
      }
    }
  }
  // --- end idempotency check ---

  const teamAgentIds = await getTeamAgentIds(params.team.id);
  const agentOutputs: Partial<Record<AgentStep["promptKey"], AgentOutput>> = {};

  const activeSteps = agentSteps.filter(
    (step) => step.promptKey !== "missionAnalysis" || Boolean(params.missionId)
  );

  for (const step of activeSteps) {
    const prompt = step.buildPrompt(identity, params.dataPackage);
    const startedAt = new Date().toISOString();
    let tokenCount = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let estimatedCostUsd = 0;
    const leafModel = params.missionId
      ? params.division.model_name
      : getLeafAgentModel(params.division.model_name);
    const teamAgentId = teamAgentIds.get(step.agentType) ?? null;
    const summary = inputSummary(prompt);
    const cachedOutput = await getCompletedAgentOutput({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      teamAgentId,
      promptKey: step.promptKey,
      provider: params.division.model_provider,
      model: leafModel,
      inputSummary: summary,
      dataPackage: params.dataPackage
    });

    if (cachedOutput) {
      agentOutputs[step.promptKey] = cachedOutput;
      continue;
    }

    try {
      const modelResult = await callModel({
        provider: params.division.model_provider,
        model: leafModel,
        prompt,
        outputSchema: AGENT_OUTPUT_JSON_SCHEMA_OBJ,
        maxOutputTokens: 1500,
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
        teamAgentId,
        provider: params.division.model_provider,
        model: leafModel,
        promptKey: step.promptKey,
        inputSummary: summary,
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
        teamAgentId,
        provider: params.division.model_provider,
        model: leafModel,
        promptKey: step.promptKey,
        inputSummary: summary,
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
  const leaderModel = params.missionId
    ? params.division.model_name
    : getTeamLeaderModel(params.division.model_name);

  try {
    const modelResult = await callModel({
      provider: params.division.model_provider,
      model: leaderModel,
      prompt: teamLeaderPrompt,
      outputSchema: TEAM_REPORT_JSON_SCHEMA_OBJ,
      maxOutputTokens: 2500,
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
      .from("stocks_team_reports")
      .insert({
        user_id: params.userId,
        family_id: familyId,
        daily_run_id: params.dailyRunId ?? null,
        mission_id: params.missionId ?? null,
        division: params.division.name,
        team_name: params.team.team_name,
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
