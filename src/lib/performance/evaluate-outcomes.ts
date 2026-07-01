import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { OHLCV } from "@/lib/market-data/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HORIZONS = [7, 30, 90] as const;
const BUY_ACTIONS = new Set(["buy", "small_buy", "add"]);
const SELL_ACTIONS = new Set(["sell", "reduce"]);
const WAIT_ACTIONS = new Set(["wait", "avoid"]);

type Market = "US" | "TW";

type RecommendationRow = {
  id: string;
  action: string;
  recommendation_date: string;
  target_price: number | null;
  stop_loss: number | null;
  status: string;
  securities: { symbol: string; market: string } | null;
};

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

function todayDateOnly() {
  return toDateOnly(new Date());
}

function isDue(recommendationDate: string, horizonDays: number, today: string) {
  return addDays(recommendationDate, horizonDays) <= today;
}

function normalizeAction(action: string) {
  return action.trim().toLowerCase();
}

function findOnOrBefore(history: OHLCV[], dateText: string) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let match: OHLCV | null = null;

  for (const point of sorted) {
    if (point.date > dateText) break;
    match = point;
  }

  return match;
}

function lowestLowBetween(history: OHLCV[], startDate: string, endDate: string) {
  const lows = history
    .filter((point) => point.date >= startDate && point.date <= endDate)
    .map((point) => point.low)
    .filter((value) => Number.isFinite(value));

  return lows.length > 0 ? Math.min(...lows) : null;
}

function pctChange(start: number, end: number) {
  if (!Number.isFinite(start) || start <= 0) return null;
  return ((end - start) / start) * 100;
}

function computeDirectionCorrect(action: string, returnPct: number | null) {
  if (returnPct === null) return null;
  if (BUY_ACTIONS.has(action)) return returnPct > 0;
  if (SELL_ACTIONS.has(action) || action === "avoid") return returnPct < 0;
  return null;
}

function computeScoreDelta(action: string, returnPct: number | null, directionCorrect: boolean | null) {
  if (returnPct === null) return 0;
  if (directionCorrect === null) return returnPct / 2;
  return directionCorrect ? Math.min(20, Math.abs(returnPct)) : -Math.min(20, Math.abs(returnPct));
}

function isMarket(value: string): value is Market {
  return value === "US" || value === "TW";
}

export async function evaluateOutcomes(
  userId: string
): Promise<{ evaluated: number; skipped: number }> {
  const supabase = createSupabaseServerClient();
  const today = todayDateOnly();
  const provider = getMarketDataProvider();
  let evaluated = 0;
  let skipped = 0;

  const { data: recommendations, error } = await supabase
    .from("stocks_recommendations")
    .select(
      "id, action, recommendation_date, target_price, stop_loss, status, securities:stocks_securities(symbol, market), recommendation_outcomes:stocks_recommendation_outcomes(horizon_days)"
    )
    .eq("user_id", userId)
    .eq("status", "open")
    .order("recommendation_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  for (const rawRecommendation of (recommendations ?? []) as unknown as Array<
    RecommendationRow & { recommendation_outcomes?: Array<{ horizon_days: number }> }
  >) {
    const recommendation = rawRecommendation;
    const security = recommendation.securities;
    const market = security?.market ?? "";

    if (!security?.symbol || !isMarket(market)) {
      skipped += HORIZONS.length;
      continue;
    }

    const existingHorizons = new Set(
      (rawRecommendation.recommendation_outcomes ?? []).map((outcome) => Number(outcome.horizon_days))
    );
    const dueHorizons = HORIZONS.filter(
      (horizon) => isDue(recommendation.recommendation_date, horizon, today) && !existingHorizons.has(horizon)
    );

    if (dueHorizons.length === 0) {
      continue;
    }

    let history: OHLCV[] = [];
    try {
      history = await provider.getHistory(security.symbol, market, 100);
    } catch {
      skipped += dueHorizons.length;
      continue;
    }

    const startPoint = findOnOrBefore(history, recommendation.recommendation_date);
    if (!startPoint || startPoint.close <= 0) {
      skipped += dueHorizons.length;
      continue;
    }

    const action = normalizeAction(recommendation.action);

    for (const horizonDays of dueHorizons) {
      const evaluationDate = addDays(recommendation.recommendation_date, horizonDays);
      const endPoint = findOnOrBefore(history, evaluationDate);

      if (!endPoint || endPoint.close <= 0) {
        skipped += 1;
        continue;
      }

      const returnPct = pctChange(startPoint.close, endPoint.close);
      const low = lowestLowBetween(history, startPoint.date, endPoint.date);
      const maxDrawdownPct = low === null ? null : pctChange(startPoint.close, low);
      const directionCorrect = computeDirectionCorrect(action, returnPct);
      const hitTarget =
        recommendation.target_price === null
          ? null
          : BUY_ACTIONS.has(action)
            ? endPoint.close >= recommendation.target_price
            : SELL_ACTIONS.has(action) || action === "avoid"
              ? endPoint.close <= recommendation.target_price
              : null;
      const hitStopLoss =
        recommendation.stop_loss === null
          ? null
          : BUY_ACTIONS.has(action)
            ? endPoint.close <= recommendation.stop_loss
            : SELL_ACTIONS.has(action) || action === "avoid"
              ? endPoint.close >= recommendation.stop_loss
              : null;
      const missedOpportunity =
        returnPct === null ? null : WAIT_ACTIONS.has(action) ? returnPct > 10 : false;

      const { error: insertError } = await supabase.from("stocks_recommendation_outcomes").insert({
        recommendation_id: recommendation.id,
        evaluation_date: evaluationDate,
        horizon_days: horizonDays,
        start_price: startPoint.close,
        end_price: endPoint.close,
        return_pct: returnPct,
        max_drawdown_pct: maxDrawdownPct,
        hit_target: hitTarget,
        hit_stop_loss: hitStopLoss,
        direction_correct: directionCorrect,
        missed_opportunity: missedOpportunity,
        score_delta: computeScoreDelta(action, returnPct, directionCorrect),
        notes: "自動績效評估"
      });

      if (insertError) {
        skipped += 1;
        continue;
      }

      existingHorizons.add(horizonDays);
      evaluated += 1;
    }

    if (HORIZONS.every((horizon) => existingHorizons.has(horizon))) {
      await supabase
        .from("stocks_recommendations")
        .update({ status: "evaluated" })
        .eq("id", recommendation.id)
        .eq("user_id", userId);
    }
  }

  return { evaluated, skipped };
}
