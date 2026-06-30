import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { getFamilyId, savePipelineAgentRun } from "@/lib/analysis/pipeline/db";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import {
  DivisionDecisionSchema,
  DIVISION_DECISION_JSON_SCHEMA,
  type DivisionDecision,
  type TeamReport
} from "@/lib/analysis/schemas";
import { buildDivisionManagerPrompt } from "@/lib/analysis/prompts/division-manager";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  runTeamPipeline,
  type Division,
  type DivisionTeam
} from "@/lib/analysis/pipeline/team";

export type DivisionPipelineResult =
  | {
      status: "completed";
      decision: DivisionDecision;
      divisionDecisionId: string;
      teamReports: TeamReport[];
    }
  | {
      status: "failed";
      error: string;
      decision: null;
      divisionDecisionId: null;
      teamReports: TeamReport[];
    };

const REPAIR_MODEL_MAP: Record<string, string> = {
  OpenAI: "gpt-4o-mini",
  Anthropic: "claude-haiku-4-5-20251001"
};

function getRepairModel(provider: string): string {
  return REPAIR_MODEL_MAP[provider] ?? "gpt-4o-mini";
}

function getAnalysisModel(provider: string, configuredModel: string): string {
  if (process.env.ANALYSIS_ECONOMY_MODE === "false") return configuredModel;
  return provider === "Anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini";
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function maxTeamsPerDivision() {
  return Math.max(1, Math.round(envNumber("ANALYSIS_MAX_TEAMS_PER_DIVISION", 2)));
}

function dataPackageSummary(dataPackage: DailyDataPackage) {
  return {
    packageDate: dataPackage.packageDate,
    portfolioCount: dataPackage.portfolio.length,
    watchlistCount: dataPackage.watchlist.length,
    marketSnapshot: dataPackage.marketSnapshot,
    dataQualitySummary: dataPackage.dataQualitySummary
  };
}

export async function runDivisionPipeline(params: {
  division: Division;
  dataPackage: DailyDataPackage;
  dailyRunId?: string | null;
  userId: string;
  missionId?: string;
}): Promise<DivisionPipelineResult> {
  const supabase = createSupabaseServiceClient();
  const { data: teamsData, error: teamsError } = await supabase
    .from("division_teams")
    .select("*")
    .eq("division_id", params.division.id)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (teamsError) {
    return {
      status: "failed",
      error: teamsError.message,
      decision: null,
      divisionDecisionId: null,
      teamReports: []
    };
  }

  const teams = ((teamsData ?? []) as DivisionTeam[]).slice(0, maxTeamsPerDivision());
  const teamResults = [];
  for (const team of teams) {
    teamResults.push(
      await runTeamPipeline({
        team,
        division: params.division,
        dataPackage: params.dataPackage,
        dailyRunId: params.dailyRunId,
        userId: params.userId,
        missionId: params.missionId
      })
    );
  }
  const completedTeamResults = teamResults.filter(
    (result): result is Extract<typeof result, { status: "completed" }> =>
      result.status === "completed"
  );
  const teamReports = completedTeamResults.map((result) => result.report);
  return runDivisionManagerPipeline({
    ...params,
    teamReports
  });
}

export async function runDivisionManagerPipeline(params: {
  division: Division;
  dataPackage: DailyDataPackage;
  dailyRunId?: string | null;
  userId: string;
  missionId?: string;
  teamReports: TeamReport[];
}): Promise<DivisionPipelineResult> {
  const supabase = createSupabaseServiceClient();
  const teamReports = params.teamReports;
  const prompt = buildDivisionManagerPrompt({
    divisionName: params.division.name,
    managerName: params.division.manager_name,
    teamReports,
    dataPackageSummary: dataPackageSummary(params.dataPackage),
    decisionMemory: params.dataPackage.decisionMemory
  });
  const startedAt = new Date().toISOString();
  const analysisModel = getAnalysisModel(
    params.division.model_provider,
    params.division.model_name
  );
  let tokenCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd = 0;

  try {
    const modelResult = await callModel({
      provider: params.division.model_provider,
      model: analysisModel,
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
      schema: DivisionDecisionSchema,
      schemaDescription: DIVISION_DECISION_JSON_SCHEMA,
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
    const decision = validation.parsed;
    const familyId = await getFamilyId(params.userId);
    const { data, error } = await supabase
      .from("division_decisions")
      .insert({
        user_id: params.userId,
        family_id: familyId,
        daily_run_id: params.dailyRunId ?? null,
        mission_id: params.missionId ?? null,
        division: decision.division,
        division_manager: decision.divisionManager,
        model_provider: params.division.model_provider,
        model_name: analysisModel,
        decision_action: decision.decisionAction,
        confidence: decision.confidence,
        market_summary: decision.marketSummary,
        portfolio_actions: decision.portfolioActions,
        mission_decision: decision.missionDecision,
        top_recommendations: decision.topRecommendations,
        supporting_teams: decision.supportingTeams,
        opposing_teams: decision.opposingTeams,
        internal_disagreements: decision.internalDisagreements
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to save division decision");
    }

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      provider: params.division.model_provider,
      model: analysisModel,
      promptKey: "divisionManager",
      inputSummary: inputSummary(prompt),
      output: decision,
      confidence: decision.confidence,
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
      decision,
      divisionDecisionId: (data as { id: string }).id,
      teamReports
    };
  } catch (error) {
    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      provider: params.division.model_provider,
      model: analysisModel,
      promptKey: "divisionManager",
      inputSummary: inputSummary(prompt),
      output: {
        error: error instanceof Error ? error.message : "Unknown division failure"
      },
      confidence: null,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown division failure"
    });

    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown division failure",
      decision: null,
      divisionDecisionId: null,
      teamReports
    };
  }
}
