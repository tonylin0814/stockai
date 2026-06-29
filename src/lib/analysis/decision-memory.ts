import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RecentDecision = {
  date: string;
  action: string;
  confidence: number;
  source: string;
  targetPrice: number | null;
  stopLoss: number | null;
  outcomes: OutcomeSummary[];
};

type OutcomeSummary = {
  horizonDays: number;
  returnPct: number | null;
  directionCorrect: boolean | null;
  hitTarget: boolean | null;
  hitStopLoss: boolean | null;
  scoreDelta: number | null;
};

type RecommendationRow = {
  id: string;
  action: string | null;
  confidence: number | null;
  source_type: string | null;
  source_name: string | null;
  target_price: number | null;
  stop_loss: number | null;
  recommendation_date: string | null;
  securities: { symbol: string | null; market: string | null } | null;
  recommendation_outcomes: Array<{
    horizon_days: number | null;
    return_pct: number | null;
    direction_correct: boolean | null;
    hit_target: boolean | null;
    hit_stop_loss: boolean | null;
    score_delta: number | null;
  }> | null;
};

/**
 * Fetch last 60 days of recommendations and outcomes for the given symbols.
 * Returns compact text suitable for prompt injection.
 */
export async function buildDecisionMemory(
  userId: string,
  symbols: string[]
): Promise<string> {
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  if (!uniqueSymbols.length) return "";

  const supabase = createSupabaseServiceClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const { data, error } = await supabase
    .from("recommendations")
    .select(
      `
      id,
      action,
      confidence,
      source_type,
      source_name,
      target_price,
      stop_loss,
      recommendation_date,
      securities!inner(symbol, market),
      recommendation_outcomes(
        horizon_days,
        return_pct,
        direction_correct,
        hit_target,
        hit_stop_loss,
        score_delta
      )
    `
    )
    .eq("user_id", userId)
    .in("securities.symbol", uniqueSymbols)
    .gte("recommendation_date", cutoff.toISOString())
    .order("recommendation_date", { ascending: false })
    .limit(50);

  if (error || !data?.length) return "";

  const bySymbol: Record<string, RecentDecision[]> = {};
  for (const rec of data as unknown as RecommendationRow[]) {
    const symbol = rec.securities?.symbol ?? "?";
    bySymbol[symbol] ??= [];

    bySymbol[symbol].push({
      date: rec.recommendation_date?.slice(0, 10) ?? "?",
      action: rec.action ?? "unknown",
      confidence: rec.confidence ?? 0,
      source: `${rec.source_type ?? "unknown"}/${rec.source_name ?? "unknown"}`,
      targetPrice: rec.target_price ?? null,
      stopLoss: rec.stop_loss ?? null,
      outcomes: (rec.recommendation_outcomes ?? []).map((outcome) => ({
        horizonDays: outcome.horizon_days ?? 0,
        returnPct: outcome.return_pct ?? null,
        directionCorrect: outcome.direction_correct ?? null,
        hitTarget: outcome.hit_target ?? null,
        hitStopLoss: outcome.hit_stop_loss ?? null,
        scoreDelta: outcome.score_delta ?? null
      }))
    });
  }

  const lines = ["## 本系統過去決策記錄（最近 60 天）"];
  for (const symbol of uniqueSymbols) {
    const history = bySymbol[symbol];
    if (!history?.length) continue;

    lines.push(`\n### ${symbol}`);
    for (const decision of history.slice(0, 3)) {
      const priceParts = [
        decision.targetPrice != null ? `目標 ${decision.targetPrice}` : "",
        decision.stopLoss != null ? `停損 ${decision.stopLoss}` : ""
      ].filter(Boolean);
      lines.push(
        `- ${decision.date} | ${decision.action}（信心 ${decision.confidence}%）| 來源：${decision.source}${
          priceParts.length ? ` | ${priceParts.join(" / ")}` : ""
        }`
      );

      if (!decision.outcomes.length) {
        lines.push("  -> 尚無追蹤結果");
        continue;
      }

      for (const outcome of decision.outcomes.sort(
        (a, b) => a.horizonDays - b.horizonDays
      )) {
        const ret =
          outcome.returnPct != null
            ? `報酬 ${outcome.returnPct > 0 ? "+" : ""}${outcome.returnPct.toFixed(1)}%`
            : "";
        const direction =
          outcome.directionCorrect != null
            ? outcome.directionCorrect
              ? "方向正確"
              : "方向錯誤"
            : "";
        const target =
          outcome.hitTarget === true
            ? "達標"
            : outcome.hitTarget === false
              ? "未達標"
              : "";
        const stopLoss = outcome.hitStopLoss === true ? "觸發停損" : "";
        const parts = [ret, direction, target, stopLoss].filter(Boolean);
        lines.push(`  -> ${outcome.horizonDays} 天後：${parts.join(" | ") || "記錄中"}`);
      }
    }
  }

  return lines.length > 1 ? lines.join("\n") : "";
}
