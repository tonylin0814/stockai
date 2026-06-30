import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { getFamilyId, savePipelineAgentRun } from "@/lib/analysis/pipeline/db";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import type { DivisionPipelineResult } from "@/lib/analysis/pipeline/division";
import {
  COMMITTEE_DECISION_JSON_SCHEMA_OBJ,
  CommitteeDecisionSchema,
  COMMITTEE_DECISION_JSON_SCHEMA,
  type CommitteeDecision
} from "@/lib/analysis/schemas";
import { buildCommitteePrompt } from "@/lib/analysis/prompts/committee";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type CommitteeRunResult =
  | {
      status: "completed";
      decision: CommitteeDecision;
      committeeDecisionId: string;
      modelProvider: string;
    }
  | {
      status: "failed";
      error: string;
      decision: null;
      committeeDecisionId: null;
      modelProvider: string;
    };

export type CommitteePipelineResult = CommitteeRunResult[];

const REPAIR_MODEL_MAP: Record<string, string> = {
  OpenAI: "gpt-4o-mini",
  Anthropic: "claude-haiku-4-5-20251001"
};

function getRepairModel(provider: string): string {
  return REPAIR_MODEL_MAP[provider] ?? "gpt-4o-mini";
}

async function getAllDivisionModels(): Promise<
  Array<{ model_provider: string; model_name: string }>
> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("divisions")
    .select("model_provider, model_name")
    .eq("is_enabled", true)
    .eq("participates_in_committee", true)
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Cannot find division models for committee");
  }

  return data as Array<{ model_provider: string; model_name: string }>;
}

function isFinalScenariosColumnMissing(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("final_scenarios"));
}

async function runSingleCommitteePass(params: {
  divisionResults: Extract<DivisionPipelineResult, { status: "completed" }>[];
  model: { model_provider: string; model_name: string };
  dataPackage: DailyDataPackage;
  dailyRunId?: string | null;
  userId: string;
  missionId?: string;
}): Promise<CommitteeRunResult> {
  const prompt = buildCommitteePrompt({
    divisionDecisions: params.divisionResults.map((result) => result.decision)
  });
  const startedAt = new Date().toISOString();
  const supabase = createSupabaseServiceClient();
  let tokenCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd = 0;

  try {
    const modelResult = await callModel({
      provider: params.model.model_provider,
      model: params.model.model_name,
      prompt,
      outputSchema: COMMITTEE_DECISION_JSON_SCHEMA_OBJ,
      maxOutputTokens: 4000,
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
      schema: CommitteeDecisionSchema,
      schemaDescription: COMMITTEE_DECISION_JSON_SCHEMA,
      provider: params.model.model_provider,
      model: getRepairModel(params.model.model_provider),
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

    const decision: CommitteeDecision = validation.parsed;
    const safeguardedDecision: CommitteeDecision = {
      ...decision,
      isActionAllowed: decision.consensusLevel === "strong" ? decision.isActionAllowed : false
    };
    const averageConfidence =
      params.divisionResults.reduce((sum, result) => sum + result.decision.confidence, 0) /
      params.divisionResults.length;
    const familyId = await getFamilyId(params.userId);
    const committeePayload: Record<string, unknown> = {
      user_id: params.userId,
      family_id: familyId,
      daily_run_id: params.dailyRunId ?? null,
      mission_id: params.missionId ?? null,
      model_provider: params.model.model_provider,
      final_action: safeguardedDecision.finalAction,
      action_type: safeguardedDecision.actionType,
      consensus_level: safeguardedDecision.consensusLevel,
      confidence: safeguardedDecision.confidence,
      weighted_confidence: averageConfidence,
      decision_summary: safeguardedDecision.reason,
      agreement_summary: safeguardedDecision.agreements.join("\n"),
      disagreement_summary: safeguardedDecision.disagreements.join("\n"),
      final_scenarios: safeguardedDecision.finalScenarios ?? null,
      final_recommendations: safeguardedDecision.finalRecommendations,
      division_inputs: params.divisionResults.map((result) => result.decision),
      is_action_allowed: safeguardedDecision.isActionAllowed
    };
    let { data, error } = await supabase
      .from("committee_decisions")
      .insert(committeePayload)
      .select("id")
      .single();

    if (isFinalScenariosColumnMissing(error)) {
      delete committeePayload.final_scenarios;
      ({ data, error } = await supabase
        .from("committee_decisions")
        .insert(committeePayload)
        .select("id")
        .single());
    }

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to save committee decision");
    }

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      provider: params.model.model_provider,
      model: params.model.model_name,
      promptKey: "committee",
      inputSummary: inputSummary(prompt),
      output: safeguardedDecision,
      confidence: safeguardedDecision.confidence,
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
      decision: safeguardedDecision,
      committeeDecisionId: (data as { id: string }).id,
      modelProvider: params.model.model_provider
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown committee failure";

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      provider: params.model.model_provider,
      model: params.model.model_name,
      promptKey: "committee",
      inputSummary: inputSummary(prompt),
      output: { error: message },
      confidence: null,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: message
    });

    return {
      status: "failed",
      error: message,
      decision: null,
      committeeDecisionId: null,
      modelProvider: params.model.model_provider
    };
  }
}

export async function runCommitteePipeline(params: {
  divisionResults: DivisionPipelineResult[];
  dataPackage: DailyDataPackage;
  dailyRunId?: string | null;
  userId: string;
  missionId?: string;
}): Promise<CommitteePipelineResult> {
  const completed = params.divisionResults.filter(
    (result): result is Extract<DivisionPipelineResult, { status: "completed" }> =>
      result.status === "completed"
  );

  if (completed.length < 2) {
    return [
      {
        status: "failed",
        error: "Committee requires at least 2 completed division decisions.",
        decision: null,
        committeeDecisionId: null,
        modelProvider: "OpenAI"
      },
      {
        status: "failed",
        error: "Committee requires at least 2 completed division decisions.",
        decision: null,
        committeeDecisionId: null,
        modelProvider: "Anthropic"
      }
    ];
  }

  const divisionModels = await getAllDivisionModels();
  const results: CommitteeRunResult[] = [];

  for (const model of divisionModels) {
    results.push(
      await runSingleCommitteePass({
        divisionResults: completed,
        model,
        dataPackage: params.dataPackage,
        dailyRunId: params.dailyRunId,
        userId: params.userId,
        missionId: params.missionId
      })
    );
  }

  return results;
}
