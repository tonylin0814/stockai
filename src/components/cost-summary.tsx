import { createSupabaseServiceClient } from "@/lib/supabase/service";

export default async function CostSummary({ userId }: { userId: string }) {
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("agent_runs")
    .select("estimated_cost_usd, token_count")
    .eq("user_id", userId)
    .gte("created_at", `${today}T00:00:00.000Z`);
  const rows = (data ?? []) as Array<{
    estimated_cost_usd: number | null;
    token_count: number | null;
  }>;
  const totalCost = rows.reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0);
  const totalTokens = rows.reduce((sum, row) => sum + (Number(row.token_count) || 0), 0);

  if (totalCost === 0) return null;

  return (
    <p className="text-xs text-slate-400">
      今日 API 費用估計：US${totalCost.toFixed(4)}（{totalTokens.toLocaleString()} tokens）
    </p>
  );
}
