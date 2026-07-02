import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type TeamReportDbRow = {
  team_name: string | null;
  team_leader: string | null;
  division: string | null;
  final_team_view: unknown;
  confidence?: number | null;
};

type DivisionDbRow = {
  division: string | null;
  division_manager: string | null;
  market_summary: string | null;
  decision_action: string | null;
  confidence: number | null;
  top_recommendations?: unknown;
};

type CommitteeDbRow = {
  model_provider: string | null;
  final_action: string | null;
  action_type: string | null;
  consensus_level: string | null;
  confidence: number | null;
  weighted_confidence?: number | null;
  decision_summary: string | null;
  agreement_summary: string | null;
  disagreement_summary: string | null;
  final_recommendations: unknown;
  is_action_allowed: boolean | null;
  created_at?: string | null;
};

export type ReportRun = {
  id: string;
  run_date: string;
  status: string;
};

export type ReportTeamRow = {
  team_name: string;
  team_leader: string;
  division: string;
  final_team_view: {
    summary?: string;
    mostImportantAction?: string;
    confidence?: number;
  } | null;
  confidence: number | null;
};

export type ReportDivisionRow = {
  division: string;
  division_manager: string;
  market_summary: string | null;
  decision_action: string | null;
  confidence: number | null;
};

export type ReportCommitteeRow = {
  model_provider: string;
  final_action: string | null;
  action_type: string | null;
  consensus_level: string | null;
  confidence: number | null;
  weighted_confidence: number | null;
  reason: string | null;
  agreements: string[] | null;
  disagreements: string[] | null;
  final_buy_zone: string | null;
  final_target_price: string | null;
  final_stop_loss: string | null;
  final_recommendations: JsonRecord[] | null;
  is_action_allowed: boolean | null;
  what_could_change_decision: string[] | null;
  created_at: string | null;
};

export type ReportData = {
  runDate: string;
  teamReports: ReportTeamRow[];
  divisions: ReportDivisionRow[];
  committees: ReportCommitteeRow[];
};

export type LoadedReport = {
  latestRun: ReportRun;
  reportData: ReportData;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asStringArray(value: string | null): string[] | null {
  const items = (value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function asRecommendationArray(value: unknown): JsonRecord[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((item) => item && typeof item === "object") as JsonRecord[];
  return rows.length ? rows : null;
}

function firstRecommendationValue(recommendations: JsonRecord[] | null, keys: string[]): string | null {
  const first = recommendations?.[0];
  if (!first) return null;
  for (const key of keys) {
    const value = first[key];
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return null;
}

function firstBuyZone(recommendations: JsonRecord[] | null): string | null {
  const first = recommendations?.[0];
  if (!first) return null;
  const direct = firstRecommendationValue(recommendations, ["buyZone", "buy_zone", "entryPoint", "entry_point"]);
  if (direct) return direct;
  const low = first.buyZoneLow ?? first.buy_zone_low ?? first.entryLow ?? first.entry_low;
  const high = first.buyZoneHigh ?? first.buy_zone_high ?? first.entryHigh ?? first.entry_high;
  if (low === null || low === undefined || low === "") return null;
  if (high === null || high === undefined || high === "") return String(low);
  return `${String(low)} - ${String(high)}`;
}

function normalizeTeam(row: TeamReportDbRow): ReportTeamRow {
  const view = asRecord(row.final_team_view);
  return {
    team_name: row.team_name ?? "—",
    team_leader: row.team_leader ?? "—",
    division: row.division ?? "未分類",
    final_team_view:
      Object.keys(view).length > 0
        ? {
            summary: typeof view.summary === "string" ? view.summary : undefined,
            mostImportantAction:
              typeof view.mostImportantAction === "string" ? view.mostImportantAction : undefined,
            confidence: typeof view.confidence === "number" ? view.confidence : undefined
          }
        : null,
    confidence: row.confidence ?? null
  };
}

function normalizeDivision(row: DivisionDbRow): ReportDivisionRow {
  return {
    division: row.division ?? "—",
    division_manager: row.division_manager ?? "—",
    market_summary: row.market_summary ?? null,
    decision_action: row.decision_action ?? null,
    confidence: row.confidence ?? null
  };
}

function normalizeCommittee(row: CommitteeDbRow): ReportCommitteeRow {
  const recommendations = asRecommendationArray(row.final_recommendations);
  return {
    model_provider: row.model_provider ?? "Legacy Provider",
    final_action: row.final_action ?? null,
    action_type: row.action_type ?? null,
    consensus_level: row.consensus_level ?? null,
    confidence: row.confidence ?? null,
    weighted_confidence: row.weighted_confidence ?? null,
    reason: row.decision_summary ?? null,
    agreements: asStringArray(row.agreement_summary),
    disagreements: asStringArray(row.disagreement_summary),
    final_buy_zone: firstBuyZone(recommendations),
    final_target_price: firstRecommendationValue(recommendations, ["targetPrice", "target_price"]),
    final_stop_loss: firstRecommendationValue(recommendations, ["stopLoss", "stop_loss"]),
    final_recommendations: recommendations,
    is_action_allowed: row.is_action_allowed ?? false,
    what_could_change_decision: null,
    created_at: row.created_at ?? null
  };
}

export async function loadCompletedReportForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<LoadedReport | null> {
  const { data: latestRun } = await supabase
    .from("stocks_daily_runs")
    .select("id, run_date, status")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRun) return null;
  return loadReportByRunId(supabase, userId, String(latestRun.id));
}

export async function loadReportByRunId(
  supabase: SupabaseClient,
  userId: string,
  runId: string
): Promise<LoadedReport | null> {
  const { data: run } = await supabase
    .from("stocks_daily_runs")
    .select("id, run_date, status")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!run) return null;

  const [teamRes, divRes, committeeRes] = await Promise.all([
    supabase
      .from("stocks_team_reports")
      .select("team_name, team_leader, division, final_team_view, confidence, created_at")
      .eq("daily_run_id", runId)
      .eq("user_id", userId)
      .order("division")
      .order("created_at"),
    supabase
      .from("stocks_division_decisions")
      .select("division, division_manager, market_summary, decision_action, confidence, top_recommendations, created_at")
      .eq("daily_run_id", runId)
      .eq("user_id", userId)
      .order("created_at"),
    supabase
      .from("stocks_committee_decisions")
      .select("model_provider, final_action, action_type, consensus_level, confidence, weighted_confidence, decision_summary, agreement_summary, disagreement_summary, final_recommendations, is_action_allowed, created_at")
      .eq("daily_run_id", runId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
  ]);

  const latestRun = run as ReportRun;
  const teamReports = ((teamRes.data ?? []) as TeamReportDbRow[]).map(normalizeTeam);
  const divisions = ((divRes.data ?? []) as DivisionDbRow[]).map(normalizeDivision);
  const committees = ((committeeRes.data ?? []) as CommitteeDbRow[]).map(normalizeCommittee);

  return {
    latestRun,
    reportData: {
      runDate: String(latestRun.run_date),
      teamReports,
      divisions,
      committees
    }
  };
}
