import { createSupabaseServerClient } from "@/lib/supabase/server";

type OutcomeRow = {
  return_pct: number | null;
  hit_target: boolean | null;
  direction_correct: boolean | null;
  recommendations: {
    security_id: string;
    user_id: string;
  } | null;
};

export type SymbolAccuracy = {
  evaluatedCount: number;
  directionCorrectCount: number;
  winRatePct: number | null;
  hitTargetCount: number;
  hitTargetPct: number | null;
  averageReturnPct: number | null;
};

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(count: number, total: number) {
  return total > 0 ? (count / total) * 100 : null;
}

export async function getSymbolAccuracy(
  userId: string,
  securityId: string
): Promise<SymbolAccuracy> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("stocks_recommendation_outcomes")
    .select(
      "return_pct, hit_target, direction_correct, recommendations:stocks_recommendations!inner(security_id, user_id)"
    )
    .eq("recommendations.user_id", userId)
    .eq("recommendations.security_id", securityId)
    .order("evaluation_date", { ascending: false })
    .limit(20);

  const rows = ((data ?? []) as unknown as OutcomeRow[]).filter(
    (row) =>
      row.recommendations?.user_id === userId &&
      row.recommendations.security_id === securityId
  );
  const directionValues = rows
    .map((row) => row.direction_correct)
    .filter((value): value is boolean => value !== null);
  const targetValues = rows
    .map((row) => row.hit_target)
    .filter((value): value is boolean => value !== null);
  const returns = rows
    .map((row) => row.return_pct)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const directionCorrectCount = directionValues.filter(Boolean).length;
  const hitTargetCount = targetValues.filter(Boolean).length;

  return {
    evaluatedCount: rows.length,
    directionCorrectCount,
    winRatePct: pct(directionCorrectCount, directionValues.length),
    hitTargetCount,
    hitTargetPct: pct(hitTargetCount, targetValues.length),
    averageReturnPct: average(returns)
  };
}
