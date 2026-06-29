import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { getFamilyId, savePipelineAgentRun } from "@/lib/analysis/pipeline/db";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import type { DivisionPipelineResult } from "@/lib/analysis/pipeline/division";
import {
  CommitteeDecisionSchema,
  COMMITTEE_DECISION_JSON_SCHEMA,
  type CommitteeDecision
} from "@/lib/analysis/schemas";
import { buildCommitteePrompt } from "@/lib/analysis/prompts/committee";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type CommitteePipelineResult =
  | {
      status: "completed";
      decision: CommitteeDecision;
      committeeDecisionId: string;
    }
  | {
      status: "failed";
      error: string;
      decision: null;
      committeeDecisionId: null;
    };

function computeConsensus(results: Array<Extract<DivisionPipelineResult, { status: "completed" }>>) {
  const actions = results.map((result) => result.decision.decisionAction);
  const averageConfidence =
    results.reduce((total, result) => total + result.decision.confidence, 0) /
    results.length;
  const bothAgree = actions.every((action) => action === actions[0]);

  if (bothAgree && averageConfidence >= 70) {
    return {
      consensusLevel: "strong" as const,
      isActionAllowed: true,
      averageConfidence
    };
  }

  if (bothAgree) {
    return {
      consensusLevel: "weak" as const,
      isActionAllowed: false,
      averageConfidence
    };
  }

  return {
    consensusLevel: "none" as const,
    isActionAllowed: false,
    averageConfidence
  };
}

async function getCommitteeModelProvider(divisionName: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("divisions")
    .select("model_provider, model_name")
    .eq("name", divisionName)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `Cannot find model for ${divisionName}`);
  }

  return data as { model_provider: string; model_name: string };
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
    return {
      status: "failed",
      error: "Committee requires at least 2 completed division decisions.",
      decision: null,
      committeeDecisionId: null
    };
  }

  const consensus = computeConsensus(completed);
  const model = await getCommitteeModelProvider(completed[0].decision.division);
  const prompt = buildCommitteePrompt({
    divisionDecisions: completed.map((result) => result.decision),
    consensus
  });
  const startedAt = new Date().toISOString();
  const supabase = createSupabaseServiceClient();
  let tokenCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd = 0;

  try {
    const modelResult = await callModel({
      provider: model.model_provider,
      model: model.model_name,
      prompt
    });
    tokenCount += modelResult.tokenCount;
    promptTokens += modelResult.promptTokens;
    completionTokens += modelResult.completionTokens;
    estimatedCostUsd += modelResult.estimatedCostUsd;
    const validation = await validateOrRepair({
      rawText: modelResult.text,
      schema: CommitteeDecisionSchema,
      schemaDescription: COMMITTEE_DECISION_JSON_SCHEMA,
      provider: model.model_provider,
      model: model.model_name
    });
    tokenCount += validation.tokenCount;
    promptTokens += validation.promptTokens;
    completionTokens += validation.completionTokens;
    estimatedCostUsd += validation.estimatedCostUsd;
    const decision: CommitteeDecision = {
      ...validation.parsed,
      consensusLevel: consensus.consensusLevel,
      isActionAllowed: consensus.isActionAllowed
    };
    const familyId = await getFamilyId(params.userId);
    const { data, error } = await supabase
      .from("committee_decisions")
      .insert({
        user_id: params.userId,
        family_id: familyId,
        daily_run_id: params.dailyRunId ?? null,
        mission_id: params.missionId ?? null,
        final_action: decision.finalAction,
        action_type: decision.actionType,
        consensus_level: decision.consensusLevel,
        confidence: decision.confidence,
        weighted_confidence: consensus.averageConfidence,
        decision_summary: decision.reason,
        agreement_summary: decision.agreements.join("\n"),
        disagreement_summary: decision.disagreements.join("\n"),
        final_recommendations: decision.finalRecommendations,
        division_inputs: completed.map((result) => result.decision),
        is_action_allowed: decision.isActionAllowed
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to save committee decision");
    }

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      provider: model.model_provider,
      model: model.model_name,
      promptKey: "committee",
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
      committeeDecisionId: (data as { id: string }).id
    };
  } catch (error) {
    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      missionId: params.missionId,
      provider: model.model_provider,
      model: model.model_name,
      promptKey: "committee",
      inputSummary: inputSummary(prompt),
      output: {
        error: error instanceof Error ? error.message : "Unknown committee failure"
      },
      confidence: null,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown committee failure"
    });

    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown committee failure",
      decision: null,
      committeeDecisionId: null
    };
  }
}
