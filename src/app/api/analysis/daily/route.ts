import { NextResponse } from "next/server";
import { buildDailyDataPackage } from "@/lib/analysis/data-package";
import { getFamilyId } from "@/lib/analysis/pipeline/db";
import { runCommitteePipeline } from "@/lib/analysis/pipeline/committee";
import { runDivisionPipeline } from "@/lib/analysis/pipeline/division";
import { writeRecommendations } from "@/lib/analysis/pipeline/recommendations";
import type { TeamReport } from "@/lib/analysis/schemas";
import type { Division } from "@/lib/analysis/pipeline/team";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function packageSummary(dataPackage: Awaited<ReturnType<typeof buildDailyDataPackage>>) {
  return {
    packageDate: dataPackage.packageDate,
    portfolioCount: dataPackage.portfolio.length,
    watchlistCount: dataPackage.watchlist.length,
    marketSnapshot: dataPackage.marketSnapshot,
    dataQualitySummary: dataPackage.dataQualitySummary
  };
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
  const runDate = todayIsoDate();
  let dailyRunId: string | null = null;

  try {
    const { data: existingRun } = await supabase
      .from("daily_runs")
      .select("id")
      .eq("user_id", user.id)
      .eq("run_date", runDate)
      .in("status", ["running", "completed"])
      .maybeSingle();

    if (existingRun) {
      return NextResponse.json(
        { error: "今日分析已執行或正在執行中。" },
        { status: 409 }
      );
    }

    const familyId = await getFamilyId(user.id);
    const { data: dailyRun, error: insertError } = await supabase
      .from("daily_runs")
      .insert({
        user_id: user.id,
        family_id: familyId,
        run_date: runDate,
        status: "running",
        started_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (insertError || !dailyRun) {
      throw new Error(insertError?.message ?? "無法建立每日分析紀錄。");
    }

    dailyRunId = (dailyRun as { id: string }).id;
    const dataPackage = await buildDailyDataPackage(user.id);
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
    const divisionResults = await Promise.all(
      divisions.map((division) =>
        runDivisionPipeline({
          division,
          dataPackage,
          dailyRunId: dailyRunId!,
          userId: user.id
        })
      )
    );
    const committeeResult = await runCommitteePipeline({
      divisionResults,
      dataPackage,
      dailyRunId,
      userId: user.id
    });

    const completedDivisionDecisions = divisionResults
      .filter((result) => result.status === "completed")
      .map((result) => ({
        decision: result.decision,
        divisionDecisionId: result.divisionDecisionId
      }));
    const { data: savedTeamReports } = await supabase
      .from("team_reports")
      .select("id, division, team_name, team_leader, market_view, portfolio_review, mission_analysis, market_scan_recommendations, final_team_view")
      .eq("daily_run_id", dailyRunId);
    const teamReports =
      ((savedTeamReports ?? []) as Array<Record<string, unknown>>).map((row) => ({
        report: {
          teamName: String(row.team_name ?? ""),
          date: dataPackage.packageDate,
          leader: String(row.team_leader ?? ""),
          marketView: row.market_view,
          portfolioReview: row.portfolio_review,
          missionAnalysis: row.mission_analysis,
          marketScanRecommendations: row.market_scan_recommendations,
          finalTeamView: row.final_team_view
        } as TeamReport,
        teamReportId: String(row.id),
        division: String(row.division ?? "")
      })) ?? [];

    await writeRecommendations({
      userId: user.id,
      familyId,
      dailyRunId,
      teamReports,
      divisionDecisions: completedDivisionDecisions,
      committeeDecision:
        committeeResult.status === "completed"
          ? {
              decision: committeeResult.decision,
              committeeDecisionId: committeeResult.committeeDecisionId
            }
          : null
    });

    await supabase
      .from("daily_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        data_package: packageSummary(dataPackage)
      })
      .eq("id", dailyRunId);

    return NextResponse.json({
      dailyRunId,
      committeeDecision:
        committeeResult.status === "completed" ? committeeResult.decision : null,
      consensusLevel:
        committeeResult.status === "completed"
          ? committeeResult.decision.consensusLevel
          : null,
      isActionAllowed:
        committeeResult.status === "completed"
          ? committeeResult.decision.isActionAllowed
          : false
    });
  } catch (error) {
    if (dailyRunId) {
      await supabase
        .from("daily_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString()
        })
        .eq("id", dailyRunId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "每日分析執行失敗。" },
      { status: 500 }
    );
  }
}
