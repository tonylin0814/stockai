import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_MAX_DAILY_COST_USD = 10;
const DEFAULT_MAX_RUN_COST_USD = 5;

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getAnalysisCostLimits() {
  return {
    daily: envNumber("ANALYSIS_MAX_DAILY_COST_USD", DEFAULT_MAX_DAILY_COST_USD),
    run: envNumber("ANALYSIS_MAX_RUN_COST_USD", DEFAULT_MAX_RUN_COST_USD)
  };
}

function todayUtcStart() {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function sumCost(rows: Array<{ estimated_cost_usd: number | null }>) {
  return rows.reduce((total, row) => total + (Number(row.estimated_cost_usd) || 0), 0);
}

async function getCost(params: {
  userId: string;
  dailyRunId?: string | null;
  missionId?: string | null;
}) {
  const supabase = createSupabaseServiceClient();
  const { data: dailyRows } = await supabase
    .from("agent_runs")
    .select("estimated_cost_usd")
    .eq("user_id", params.userId)
    .gte("created_at", todayUtcStart());

  let runRows: Array<{ estimated_cost_usd: number | null }> = [];

  if (params.dailyRunId) {
    const { data } = await supabase
      .from("agent_runs")
      .select("estimated_cost_usd")
      .eq("user_id", params.userId)
      .eq("daily_run_id", params.dailyRunId);
    runRows = (data ?? []) as Array<{ estimated_cost_usd: number | null }>;
  } else if (params.missionId) {
    const { data } = await supabase
      .from("agent_runs")
      .select("estimated_cost_usd")
      .eq("user_id", params.userId)
      .eq("mission_id", params.missionId);
    runRows = (data ?? []) as Array<{ estimated_cost_usd: number | null }>;
  }

  return {
    dailyCost: sumCost((dailyRows ?? []) as Array<{ estimated_cost_usd: number | null }>),
    runCost: sumCost(runRows)
  };
}

export async function assertAnalysisBudget(params: {
  userId: string;
  dailyRunId?: string | null;
  missionId?: string | null;
  projectedCostUsd?: number;
}) {
  const limits = getAnalysisCostLimits();
  const { dailyCost, runCost } = await getCost(params);
  const projectedCost = Math.max(0, Number(params.projectedCostUsd) || 0);
  const projectedDailyCost = dailyCost + projectedCost;
  const projectedRunCost = runCost + projectedCost;

  if (projectedDailyCost > limits.daily) {
    throw new Error(
      `今日 API 成本會超過上限 US$${limits.daily.toFixed(2)}，目前約 US$${dailyCost.toFixed(
        4
      )}，下一步預估約 US$${projectedCost.toFixed(4)}。已停止新的分析以避免繼續花費。`
    );
  }

  if ((params.dailyRunId || params.missionId) && projectedRunCost > limits.run) {
    throw new Error(
      `本次分析成本會超過上限 US$${limits.run.toFixed(2)}，目前約 US$${runCost.toFixed(
        4
      )}，下一步預估約 US$${projectedCost.toFixed(4)}。已停止後續模型呼叫。`
    );
  }
}
