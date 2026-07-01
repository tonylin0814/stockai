import { createSupabaseServerClient } from "@/lib/supabase/server";

type SourceType = "team" | "division" | "committee";

type OutcomeRow = {
  horizon_days: number;
  return_pct: number | null;
  max_drawdown_pct: number | null;
  hit_stop_loss: boolean | null;
  direction_correct: boolean | null;
  missed_opportunity: boolean | null;
  recommendations: {
    id: string;
    user_id: string;
    family_id: string | null;
    source_type: SourceType;
    source_name: string;
    division: string | null;
    team_name: string | null;
    action: string;
    confidence: number;
  } | null;
};

type Entity = {
  type: SourceType;
  name: string;
  division: string | null;
  familyId: string | null;
  rows: OutcomeRow[];
};

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pctTrue(values: boolean[]) {
  if (values.length === 0) return null;
  return (values.filter(Boolean).length / values.length) * 100;
}

function normalizeAction(action: string) {
  return action.trim().toLowerCase();
}

function entityKey(row: OutcomeRow) {
  const recommendation = row.recommendations;
  if (!recommendation) return null;

  if (recommendation.source_type === "team") {
    return {
      key: `team:${recommendation.division ?? ""}:${recommendation.team_name ?? recommendation.source_name}`,
      type: "team" as const,
      name: recommendation.team_name ?? recommendation.source_name,
      division: recommendation.division,
      familyId: recommendation.family_id
    };
  }

  if (recommendation.source_type === "division") {
    return {
      key: `division:${recommendation.division ?? recommendation.source_name}`,
      type: "division" as const,
      name: recommendation.division ?? recommendation.source_name,
      division: recommendation.division,
      familyId: recommendation.family_id
    };
  }

  return {
    key: "committee:Cross-Division Investment Committee",
    type: "committee" as const,
    name: "Cross-Division Investment Committee",
    division: null,
    familyId: recommendation.family_id
  };
}

function accuracyScore(rows: OutcomeRow[]) {
  const scored = rows
    .map((row) => row.direction_correct)
    .filter((value): value is boolean => value !== null);

  return pctTrue(scored) ?? 50;
}

function returnScore(rows: OutcomeRow[]) {
  const returns = rows
    .map((row) => row.return_pct)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const avgReturn = average(returns);

  if (avgReturn === null) return 50;
  return clamp(((avgReturn + 20) / 40) * 100);
}

function riskControlScore(rows: OutcomeRow[]) {
  const scores = rows.map((row) => {
    const action = normalizeAction(row.recommendations?.action ?? "");

    if (["buy", "small_buy", "add"].includes(action)) {
      if (row.hit_stop_loss === null) return 50;
      return row.hit_stop_loss ? 0 : 100;
    }

    if (["wait", "avoid"].includes(action)) {
      if (row.missed_opportunity === null) return 50;
      return row.missed_opportunity ? 25 : 75;
    }

    if (["sell", "reduce"].includes(action)) {
      return row.direction_correct === true ? 100 : row.direction_correct === false ? 25 : 50;
    }

    return 50;
  });

  return average(scores) ?? 50;
}

function confidenceCalibrationScore(rows: OutcomeRow[]) {
  const calibrated = rows
    .map((row) => {
      if (row.direction_correct === null || !row.recommendations) return null;
      const confidence = clamp(Number(row.recommendations.confidence) || 50) / 100;
      const actual = row.direction_correct ? 1 : 0;
      return 100 - Math.abs(confidence - actual) * 100;
    })
    .filter((value): value is number => value !== null);

  return average(calibrated) ?? 50;
}

function influencePoints(scores: {
  accuracy: number;
  returns: number;
  risk: number;
  confidence: number;
}) {
  return (
    0.35 * scores.accuracy +
    0.25 * scores.returns +
    0.25 * scores.risk +
    0.15 * scores.confidence
  );
}

function bestCall(rows: OutcomeRow[]) {
  const candidates = rows.filter((row) => row.return_pct !== null);
  const best = candidates.sort((a, b) => Number(b.return_pct) - Number(a.return_pct))[0];
  return best
    ? {
        recommendation_id: best.recommendations?.id,
        return_pct: best.return_pct,
        horizon_days: best.horizon_days
      }
    : null;
}

function worstCall(rows: OutcomeRow[]) {
  const candidates = rows.filter((row) => row.return_pct !== null);
  const worst = candidates.sort((a, b) => Number(a.return_pct) - Number(b.return_pct))[0];
  return worst
    ? {
        recommendation_id: worst.recommendations?.id,
        return_pct: worst.return_pct,
        horizon_days: worst.horizon_days
      }
    : null;
}

function horizonAccuracy(rows: OutcomeRow[], horizonDays: number) {
  const values = rows
    .filter((row) => row.horizon_days === horizonDays)
    .map((row) => row.direction_correct)
    .filter((value): value is boolean => value !== null);

  return pctTrue(values);
}

function buildEntities(rows: OutcomeRow[]) {
  const entities = new Map<string, Entity>();

  for (const row of rows) {
    const descriptor = entityKey(row);
    if (!descriptor) continue;

    const current =
      entities.get(descriptor.key) ??
      ({
        type: descriptor.type,
        name: descriptor.name,
        division: descriptor.division,
        familyId: descriptor.familyId,
        rows: []
      } satisfies Entity);

    current.rows.push(row);
    entities.set(descriptor.key, current);
  }

  return Array.from(entities.values());
}

export async function updateInfluencePoints(userId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const scoreDate = todayDateOnly();

  const { data, error } = await supabase
    .from("stocks_recommendation_outcomes")
    .select(
      "horizon_days, return_pct, max_drawdown_pct, hit_stop_loss, direction_correct, missed_opportunity, recommendations:stocks_recommendations(id, user_id, family_id, source_type, source_name, division, team_name, action, confidence)"
    )
    .eq("recommendations.user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as unknown as OutcomeRow[]).filter(
    (row) => row.recommendations?.user_id === userId
  );
  const entities = buildEntities(rows);

  for (const entity of entities) {
    if (entity.rows.length < 3) continue;

    const scores = {
      accuracy: accuracyScore(entity.rows),
      returns: returnScore(entity.rows),
      risk: riskControlScore(entity.rows),
      confidence: confidenceCalibrationScore(entity.rows)
    };
    const influence = influencePoints(scores);
    const returns = entity.rows
      .map((row) => row.return_pct)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const drawdowns = entity.rows
      .map((row) => row.max_drawdown_pct)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const wins = entity.rows
      .map((row) => row.direction_correct)
      .filter((value): value is boolean => value !== null);

    await supabase.from("stocks_influence_scores").insert({
      user_id: userId,
      family_id: entity.familyId,
      entity_type: entity.type,
      entity_name: entity.name,
      division: entity.division,
      score_date: scoreDate,
      accuracy_score: scores.accuracy,
      return_score: scores.returns,
      risk_control_score: scores.risk,
      confidence_calibration_score: scores.confidence,
      influence_points: influence,
      decision_weight: clamp(influence / 100),
      change_reason: "自動績效更新"
    });

    await supabase.from("stocks_performance_snapshots").insert({
      user_id: userId,
      family_id: entity.familyId,
      snapshot_date: scoreDate,
      entity_type: entity.type,
      entity_name: entity.name,
      division: entity.division,
      accuracy_7d: horizonAccuracy(entity.rows, 7),
      accuracy_30d: horizonAccuracy(entity.rows, 30),
      accuracy_90d: horizonAccuracy(entity.rows, 90),
      average_return_pct: average(returns),
      average_drawdown_pct: average(drawdowns),
      win_rate: pctTrue(wins),
      recommendation_count: entity.rows.length,
      best_call: bestCall(entity.rows),
      worst_call: worstCall(entity.rows)
    });
  }
}
