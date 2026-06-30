import type {
  CommitteeDecision,
  DivisionDecision,
  MarketScanRecommendationSchema,
  TeamReport
} from "@/lib/analysis/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { z } from "zod";

type MarketScanRecommendation = z.infer<typeof MarketScanRecommendationSchema>;

type SourceRecommendation = {
  symbol?: unknown;
  market?: unknown;
  name?: unknown;
  action?: unknown;
  reason?: unknown;
  buyZone?: unknown;
  targetPrice?: unknown;
  stopLoss?: unknown;
  positionSizePct?: unknown;
  positionSize?: unknown;
  timeHorizon?: unknown;
  confidence?: unknown;
  keyRisks?: unknown;
  technicalHighlights?: unknown;
};

function asRecord(value: unknown): SourceRecommendation {
  return typeof value === "object" && value !== null
    ? (value as SourceRecommendation)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseFirstNumber(value: unknown) {
  const text = asString(value);
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseBuyZone(value: unknown) {
  const text = asString(value).replace(/[,$，]/g, "");
  const numbers = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

  if (numbers.length >= 2) {
    return {
      low: Math.min(numbers[0], numbers[1]),
      high: Math.max(numbers[0], numbers[1])
    };
  }

  if (numbers.length === 1) {
    return {
      low: numbers[0],
      high: numbers[0]
    };
  }

  return {
    low: null,
    high: null
  };
}

function parsePositionSize(value: unknown) {
  const numberValue = asNumber(value);

  if (numberValue !== null) {
    return numberValue;
  }

  return parseFirstNumber(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

async function upsertSecurity(params: {
  symbol: string;
  market: "US" | "TW";
  name: string;
}) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("securities")
    .upsert(
      {
        symbol: params.symbol,
        market: params.market,
        name: params.name,
        security_type: "stock",
        currency: params.market === "TW" ? "TWD" : "USD"
      },
      { onConflict: "symbol,market" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to upsert recommendation security");
  }

  return (data as { id: string }).id;
}

async function buildRecommendationRow(params: {
  userId: string;
  familyId: string | null;
  dailyRunId?: string | null;
  missionId?: string;
  sourceType: "team" | "division" | "committee";
  sourceId: string;
  sourceName: string;
  division?: string | null;
  teamName?: string | null;
  recommendation: SourceRecommendation;
  fallbackAction?: string;
}) {
  const symbol = asString(params.recommendation.symbol).toUpperCase();
  const market = asString(params.recommendation.market);
  const name = asString(params.recommendation.name) || symbol;
  const action = asString(params.recommendation.action) || params.fallbackAction || "";
  const reason = asString(params.recommendation.reason);
  const confidence = asNumber(params.recommendation.confidence);

  if (!symbol || !["US", "TW"].includes(market) || !action || !reason || confidence === null) {
    return null;
  }

  const securityId = await upsertSecurity({
    symbol,
    market: market as "US" | "TW",
    name
  });
  const buyZone = parseBuyZone(params.recommendation.buyZone);

  return {
    user_id: params.userId,
    family_id: params.familyId,
    daily_run_id: params.dailyRunId ?? null,
    mission_id: params.missionId ?? null,
    source_type: params.sourceType,
    team_report_id: params.sourceType === "team" ? params.sourceId : null,
    division_decision_id: params.sourceType === "division" ? params.sourceId : null,
    committee_decision_id: params.sourceType === "committee" ? params.sourceId : null,
    source_name: params.sourceName,
    division: params.division ?? null,
    team_name: params.teamName ?? null,
    security_id: securityId,
    recommendation_date: new Date().toISOString().slice(0, 10),
    action,
    buy_zone_low: buyZone.low,
    buy_zone_high: buyZone.high,
    target_price: parseFirstNumber(params.recommendation.targetPrice),
    stop_loss: parseFirstNumber(params.recommendation.stopLoss),
    position_size_pct: parsePositionSize(
      params.recommendation.positionSizePct ?? params.recommendation.positionSize
    ),
    time_horizon: asString(params.recommendation.timeHorizon) || null,
    confidence,
    reason,
    key_risks: Array.isArray(params.recommendation.keyRisks)
      ? params.recommendation.keyRisks
      : [],
    technical_highlights: asStringArray(params.recommendation.technicalHighlights),
    status: "open"
  };
}

function committeeFallbackRecommendation(
  decision: CommitteeDecision,
  divisionDecisions: Array<{ decision: DivisionDecision; divisionDecisionId: string }>
): SourceRecommendation | null {
  const firstRecommendation = decision.finalRecommendations[0]
    ? asRecord(decision.finalRecommendations[0])
    : null;
  const divisionRecommendation = divisionDecisions
    .flatMap((item) => item.decision.topRecommendations)
    .map(asRecord)
    .find((recommendation) => asString(recommendation.symbol));
  const source = firstRecommendation ?? divisionRecommendation;

  if (!source) return null;

  return {
    ...source,
    action: decision.actionType || decision.finalAction || source.action,
    reason: decision.reason || source.reason,
    buyZone: decision.finalBuyZone || source.buyZone,
    targetPrice: decision.finalTargetPrice || source.targetPrice,
    stopLoss: decision.finalStopLoss || source.stopLoss,
    positionSize: decision.finalPositionSize || source.positionSize,
    confidence: decision.confidence,
    keyRisks: decision.mostConservativeDivision
      ? [`保守觀點：${decision.mostConservativeDivision}`, ...asStringArray(source.keyRisks)]
      : source.keyRisks,
    technicalHighlights: source.technicalHighlights
  };
}

export async function writeRecommendations(params: {
  userId: string;
  familyId: string | null;
  dailyRunId?: string | null;
  missionId?: string;
  teamReports: Array<{ report: TeamReport; teamReportId: string; division: string }>;
  divisionDecisions: Array<{
    decision: DivisionDecision;
    divisionDecisionId: string;
  }>;
  committeeDecision: {
    decision: CommitteeDecision;
    committeeDecisionId: string;
  } | null;
}): Promise<void> {
  const rows = [];

  for (const item of params.teamReports) {
    for (const recommendation of item.report.marketScanRecommendations) {
      const row = await buildRecommendationRow({
        userId: params.userId,
        familyId: params.familyId,
        dailyRunId: params.dailyRunId,
        missionId: params.missionId,
        sourceType: "team",
        sourceId: item.teamReportId,
        sourceName: item.report.teamName,
        division: item.division,
        teamName: item.report.teamName,
        recommendation: recommendation as MarketScanRecommendation,
        fallbackAction: "watch"
      });

      if (row) {
        rows.push(row);
      }
    }
  }

  for (const item of params.divisionDecisions) {
    for (const recommendation of item.decision.topRecommendations) {
      const row = await buildRecommendationRow({
        userId: params.userId,
        familyId: params.familyId,
        dailyRunId: params.dailyRunId,
        missionId: params.missionId,
        sourceType: "division",
        sourceId: item.divisionDecisionId,
        sourceName: item.decision.division,
        division: item.decision.division,
        recommendation: asRecord(recommendation),
        fallbackAction: item.decision.decisionAction
      });

      if (row) {
        rows.push(row);
      }
    }
  }

  if (params.committeeDecision) {
    const committeeRecommendations =
      params.committeeDecision.decision.isActionAllowed &&
      params.committeeDecision.decision.finalRecommendations.length
        ? params.committeeDecision.decision.finalRecommendations.map(asRecord)
        : [
            committeeFallbackRecommendation(
              params.committeeDecision.decision,
              params.divisionDecisions
            )
          ].filter((item): item is SourceRecommendation => Boolean(item));

    for (const recommendation of committeeRecommendations) {
      const row = await buildRecommendationRow({
        userId: params.userId,
        familyId: params.familyId,
        dailyRunId: params.dailyRunId,
        missionId: params.missionId,
        sourceType: "committee",
        sourceId: params.committeeDecision.committeeDecisionId,
        sourceName: "投資委員會",
        recommendation,
        fallbackAction: params.committeeDecision.decision.actionType
      });

      if (row) {
        rows.push(row);
      }
    }
  }

  if (!rows.length) {
    return;
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("recommendations").insert(rows);

  if (error) {
    throw new Error(error.message);
  }
}
