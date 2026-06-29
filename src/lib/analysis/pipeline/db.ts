import { PROMPT_VERSIONS } from "@/lib/analysis/prompts/versions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function getFamilyId(userId: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", userId)
    .maybeSingle();

  return (data as { family_id?: string | null } | null)?.family_id ?? null;
}

export async function savePipelineAgentRun(params: {
  userId: string;
  dailyRunId?: string | null;
  missionId?: string;
  teamAgentId?: string | null;
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
    daily_run_id: params.dailyRunId ?? null,
    mission_id: params.missionId ?? null,
    team_agent_id: params.teamAgentId ?? null,
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
