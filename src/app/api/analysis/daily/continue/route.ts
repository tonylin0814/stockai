import { NextResponse } from "next/server";
import { buildDailyDataPackage, type DailyDataPackage } from "@/lib/analysis/data-package";
import { runWebResearch } from "@/lib/analysis/web-research";
import { runCommitteePipeline } from "@/lib/analysis/pipeline/committee";
import type { DivisionPipelineResult } from "@/lib/analysis/pipeline/division";
import { runDivisionManagerPipeline } from "@/lib/analysis/pipeline/division";
import { runMarketAnalysis, type MarketAnalysisResult } from "@/lib/analysis/pipeline/market-analysis";
import { writeRecommendations } from "@/lib/analysis/pipeline/recommendations";
import { runTaiwanScan } from "@/lib/analysis/pipeline/tw-scan";
import type { CommitteeDecision, DivisionDecision, TeamReport } from "@/lib/analysis/schemas";
import { runTeamPipeline, type Division, type DivisionTeam } from "@/lib/analysis/pipeline/team";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 55;

type StoredDivisionResult =
  | {
      status: "completed";
      decision: DivisionDecision;
      divisionDecisionId: string;
    }
  | {
      status: "failed";
      error: string;
    };

type StoredCommitteeResult =
  | {
      status: "completed";
      decision: CommitteeDecision;
      committeeDecisionId: string;
      modelProvider: string;
    }
  | {
      status: "failed";
      error: string;
      modelProvider: string;
    };

type DailyRunState = {
  pipelineStage?: string;
  stageMessage?: string;
  familyId?: string | null;
  divisionIndex?: number;
  teamIndex?: number;
  dataPackage?: DailyDataPackage;
  divisionResults?: StoredDivisionResult[];
  committeeResults?: StoredCommitteeResult[];
  error?: string;
  runningTeamKey?: string | null;
  runningTeamStartedAt?: string | null;
  runningCommitteeStartedAt?: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function maxTeamsPerDivision() {
  return Math.max(1, Math.round(envNumber("ANALYSIS_MAX_TEAMS_PER_DIVISION", 5)));
}

function asState(value: unknown): DailyRunState {
  return value && typeof value === "object" ? (value as DailyRunState) : {};
}

const TEAM_LOCK_TIMEOUT_MS = 90_000;

function isTeamLockStale(startedAt: string | null | undefined): boolean {
  if (!startedAt) return true;
  return Date.now() - new Date(startedAt).getTime() > TEAM_LOCK_TIMEOUT_MS;
}

function isCommitteeLockStale(startedAt: string | null | undefined): boolean {
  if (!startedAt) return true;
  return Date.now() - new Date(startedAt).getTime() > TEAM_LOCK_TIMEOUT_MS;
}

function packageSummary(dataPackage: DailyDataPackage) {
  return {
    packageDate: dataPackage.packageDate,
    portfolioCount: dataPackage.portfolio.length,
    watchlistCount: dataPackage.watchlist.length,
    marketSnapshot: dataPackage.marketSnapshot,
    dataQualitySummary: dataPackage.dataQualitySummary,
    upcomingEarnings: dataPackage.upcomingEarnings
  };
}

function rowToTeamReport(row: Record<string, unknown>, date: string): TeamReport {
  return {
    teamName: String(row.team_name ?? ""),
    date,
    leader: String(row.team_leader ?? ""),
    marketView: row.market_view,
    portfolioReview: row.portfolio_review,
    missionAnalysis: row.mission_analysis,
    marketScanRecommendations: row.market_scan_recommendations,
    finalTeamView: row.final_team_view
  } as TeamReport;
}

function toDivisionPipelineResults(results: StoredDivisionResult[]): DivisionPipelineResult[] {
  return results.map((result) =>
    result.status === "completed"
      ? {
          status: "completed",
          decision: result.decision,
          divisionDecisionId: result.divisionDecisionId,
          teamReports: []
        }
      : {
          status: "failed",
          error: result.error,
          decision: null,
          divisionDecisionId: null,
          teamReports: []
        }
  );
}

async function saveMarketAnalysis(params: {
  userId: string;
  dailyRunId: string;
  result: MarketAnalysisResult;
}) {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("market_analysis_runs").insert({
    user_id: params.userId,
    daily_run_id: params.dailyRunId,
    market: params.result.market,
    sentiment: params.result.sentiment,
    sentiment_reason: params.result.sentimentReason,
    picks_under_50: params.result.picksUnder50,
    picks_under_100: params.result.picksUnder100,
    picks_under_200: params.result.picksUnder200,
    etf_picks: params.result.etfPicks
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function updateRunState(dailyRunId: string, state: DailyRunState) {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("daily_runs")
    .update({ data_package: state })
    .eq("id", dailyRunId);
}

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登入。" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: run } = await supabase
    .from("daily_runs")
    .select("id, status, data_package")
    .eq("user_id", user.id)
    .eq("run_date", todayIsoDate())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "找不到正在執行的每日分析。" }, { status: 404 });
  }

  const dailyRunId = String((run as { id: string }).id);

  if (String((run as { status?: string }).status) !== "running") {
    return NextResponse.json({
      status: String((run as { status?: string }).status ?? "unknown"),
      dailyRunId
    });
  }

  const state = asState((run as { data_package?: unknown }).data_package);
  const stage = state.pipelineStage ?? "data_package";

  try {
    if (stage === "data_package") {
      const dataPackage = await buildDailyDataPackage(user.id);
      dataPackage.webResearch =
        process.env.ANALYSIS_ENABLE_WEB_RESEARCH === "true"
          ? await runWebResearch({
              symbols: [
                ...dataPackage.portfolio.map((item) => ({
                  symbol: item.symbol,
                  name: item.name,
                  market: item.market
                })),
                ...dataPackage.watchlist.map((item) => ({
                  symbol: item.symbol,
                  name: item.name,
                  market: item.market
                }))
              ]
            })
          : null;

      await updateRunState(dailyRunId, {
        ...state,
        pipelineStage: "division",
        stageMessage: "資料包完成，正在執行 GPT / Anthropic 分析。",
        divisionIndex: 0,
        teamIndex: 0,
        dataPackage,
        divisionResults: []
      });

      return NextResponse.json({ status: "running", stage: "division", dailyRunId });
    }

    if (!state.dataPackage) {
      throw new Error("每日分析缺少資料包，請重新執行。");
    }
    const dataPackage = state.dataPackage;

    if (stage === "division") {
      const { data: divisionsData, error: divisionsError } = await supabase
        .from("divisions")
        .select("*")
        .eq("is_enabled", true)
        .eq("participates_in_committee", true)
        .order("sort_order", { ascending: true });

      if (divisionsError) {
        throw new Error(divisionsError.message);
      }

      const divisions = (divisionsData ?? []) as Division[];
      const divisionIndex = state.divisionIndex ?? 0;
      const teamIndex = state.teamIndex ?? 0;
      const division = divisions[divisionIndex];

      if (!division) {
        await updateRunState(dailyRunId, {
          ...state,
          pipelineStage: "committee",
          stageMessage: "Division 分析完成，正在進行委員會決策。"
        });
        return NextResponse.json({ status: "running", stage: "committee", dailyRunId });
      }

      const { data: teamsData, error: teamsError } = await supabase
        .from("division_teams")
        .select("*")
        .eq("division_id", division.id)
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      if (teamsError) {
        throw new Error(teamsError.message);
      }

      const teams = ((teamsData ?? []) as DivisionTeam[]).slice(0, maxTeamsPerDivision());
      const team = teams[teamIndex];

      if (team) {
        const teamKey = `div-${divisionIndex}-team-${teamIndex}`;

        if (
          state.runningTeamKey === teamKey &&
          !isTeamLockStale(state.runningTeamStartedAt)
        ) {
          return NextResponse.json({ status: "running", stage: "division", dailyRunId });
        }

        await updateRunState(dailyRunId, {
          ...state,
          runningTeamKey: teamKey,
          runningTeamStartedAt: new Date().toISOString()
        });

        try {
          await runTeamPipeline({
            team,
            division,
            dataPackage,
            dailyRunId,
            userId: user.id
          });
        } catch {
          // Let the pipeline continue with the remaining completed team reports.
        }

        const nextTeamIndex = teamIndex + 1;

        await updateRunState(dailyRunId, {
          ...state,
          pipelineStage: "division",
          stageMessage: `${division.name}：已完成 ${nextTeamIndex}/${teams.length} 個 team。`,
          divisionIndex,
          teamIndex: nextTeamIndex,
          runningTeamKey: null,
          runningTeamStartedAt: null
        });

        return NextResponse.json({ status: "running", stage: "division", dailyRunId });
      }

      const { data: savedTeamReports } = await supabase
        .from("team_reports")
        .select("id, division, team_name, team_leader, market_view, portfolio_review, mission_analysis, market_scan_recommendations, final_team_view")
        .eq("daily_run_id", dailyRunId)
        .eq("division", division.name);
      const teamReports = ((savedTeamReports ?? []) as Array<Record<string, unknown>>).map((row) =>
        rowToTeamReport(row, dataPackage.packageDate)
      );
      const result = await runDivisionManagerPipeline({
        division,
        dataPackage,
        dailyRunId,
        userId: user.id,
        teamReports
      });
      const storedResult: StoredDivisionResult =
        result.status === "completed"
          ? {
              status: "completed",
              decision: result.decision,
              divisionDecisionId: result.divisionDecisionId
            }
          : { status: "failed", error: result.error };
      const nextIndex = divisionIndex + 1;

      await updateRunState(dailyRunId, {
        ...state,
        pipelineStage: nextIndex >= divisions.length ? "committee" : "division",
        stageMessage:
          nextIndex >= divisions.length
            ? "Division 分析完成，正在進行委員會決策。"
            : `已完成 ${nextIndex}/${divisions.length} 個 Division，準備下一個 Division。`,
        divisionIndex: nextIndex,
        teamIndex: 0,
        divisionResults: [...(state.divisionResults ?? []), storedResult]
      });

      return NextResponse.json({ status: "running", stage: "division", dailyRunId });
    }

    if (stage === "committee") {
      if (state.runningCommitteeStartedAt && !isCommitteeLockStale(state.runningCommitteeStartedAt)) {
        return NextResponse.json({ status: "running", stage: "committee", dailyRunId });
      }

      await updateRunState(dailyRunId, {
        ...state,
        runningCommitteeStartedAt: new Date().toISOString()
      });

      const committeeResults = await runCommitteePipeline({
        divisionResults: toDivisionPipelineResults(state.divisionResults ?? []),
        dataPackage,
        dailyRunId,
        userId: user.id
      });
      const storedCommitteeResults: StoredCommitteeResult[] = committeeResults.map((result) =>
        result.status === "completed"
          ? {
              status: "completed",
              decision: result.decision,
              committeeDecisionId: result.committeeDecisionId,
              modelProvider: result.modelProvider
            }
          : {
              status: "failed",
              error: result.error,
              modelProvider: result.modelProvider
            }
      );

      await updateRunState(dailyRunId, {
        ...state,
        pipelineStage: "recommendations",
        stageMessage: "委員會完成，正在寫入建議。",
        committeeResults: storedCommitteeResults,
        runningCommitteeStartedAt: null
      });

      return NextResponse.json({ status: "running", stage: "recommendations", dailyRunId });
    }

    if (stage === "recommendations") {
      const { data: savedTeamReports } = await supabase
        .from("team_reports")
        .select("id, division, team_name, team_leader, market_view, portfolio_review, mission_analysis, market_scan_recommendations, final_team_view")
        .eq("daily_run_id", dailyRunId);
      const teamReports =
        ((savedTeamReports ?? []) as Array<Record<string, unknown>>).map((row) => ({
          report: rowToTeamReport(row, dataPackage.packageDate),
          teamReportId: String(row.id),
          division: String(row.division ?? "")
        })) ?? [];
      const completedDivisionDecisions = (state.divisionResults ?? [])
        .filter(
          (result): result is Extract<StoredDivisionResult, { status: "completed" }> =>
            result.status === "completed"
        )
        .map((result) => ({
          decision: result.decision,
          divisionDecisionId: result.divisionDecisionId
        }));
      const firstCompletedCommittee = (state.committeeResults ?? []).find(
        (result): result is Extract<StoredCommitteeResult, { status: "completed" }> =>
          result.status === "completed"
      );
      const committeeDecision = firstCompletedCommittee
        ? {
            decision: firstCompletedCommittee.decision,
            committeeDecisionId: firstCompletedCommittee.committeeDecisionId
          }
        : null;

      await writeRecommendations({
        userId: user.id,
        familyId: state.familyId ?? null,
        dailyRunId,
        teamReports,
        divisionDecisions: completedDivisionDecisions,
        committeeDecision
      });

      await updateRunState(dailyRunId, {
        ...state,
        pipelineStage: "tw_scan",
        stageMessage: "建議已寫入，正在執行台股掃描。"
      });

      return NextResponse.json({ status: "running", stage: "tw_scan", dailyRunId });
    }

    if (stage === "tw_scan") {
      await runTaiwanScan({
        dataPackage,
        userId: user.id,
        dailyRunId
      });
      await updateRunState(dailyRunId, {
        ...state,
        pipelineStage: "market_tw",
        stageMessage: "台股掃描完成，正在產生台灣市場分析。"
      });

      return NextResponse.json({ status: "running", stage: "market_tw", dailyRunId });
    }

    if (stage === "market_tw" || stage === "market_us") {
      const market = stage === "market_tw" ? "TW" : "US";
      const excludeSymbols = new Set([
        ...dataPackage.portfolio.map((item) => item.symbol),
        ...dataPackage.watchlist.map((item) => item.symbol)
      ]);
      const analysis = await runMarketAnalysis({
        market,
        excludeSymbols,
        marketSnapshot: {
          indexPrice:
            market === "TW"
              ? dataPackage.marketSnapshot.taiex.price
              : dataPackage.marketSnapshot.sp500.price,
          indexChangePct:
            market === "TW"
              ? dataPackage.marketSnapshot.taiex.changePct
              : dataPackage.marketSnapshot.sp500.changePct,
          vix: dataPackage.marketSnapshot.vix.price
        },
        userId: user.id,
        dailyRunId
      });
      await saveMarketAnalysis({ userId: user.id, dailyRunId, result: analysis });
      await updateRunState(dailyRunId, {
        ...state,
        pipelineStage: stage === "market_tw" ? "market_us" : "complete",
        stageMessage:
          stage === "market_tw"
            ? "台灣市場分析完成，正在產生美國市場分析。"
            : "市場分析完成，正在收尾。"
      });

      return NextResponse.json({ status: "running", stage, dailyRunId });
    }

    await supabase
      .from("daily_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        data_package: packageSummary(dataPackage)
      })
      .eq("id", dailyRunId)
      .eq("user_id", user.id);

    return NextResponse.json({ status: "completed", dailyRunId });
  } catch (error) {
    await supabase
      .from("daily_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        data_package: {
          ...state,
          pipelineStage: "failed",
          error: error instanceof Error ? error.message.slice(0, 500) : "每日分析執行失敗。"
        }
      })
      .eq("id", dailyRunId)
      .eq("user_id", user.id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "每日分析執行失敗。" },
      { status: 500 }
    );
  }
}
