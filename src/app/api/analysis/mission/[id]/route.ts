import { NextResponse, type NextRequest } from "next/server";
import { buildMissionDataPackage } from "@/lib/analysis/mission-package";
import { runWebResearch } from "@/lib/analysis/web-research";
import { getFamilyId } from "@/lib/analysis/pipeline/db";
import { runCommitteePipeline } from "@/lib/analysis/pipeline/committee";
import { runDivisionPipeline } from "@/lib/analysis/pipeline/division";
import { runSingleStockMission } from "@/lib/analysis/pipeline/single-stock";
import { writeRecommendations } from "@/lib/analysis/pipeline/recommendations";
import type { TeamReport } from "@/lib/analysis/schemas";
import type { Division } from "@/lib/analysis/pipeline/team";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

function missionSummary(dataPackage: Awaited<ReturnType<typeof buildMissionDataPackage>>) {
  return {
    packageDate: dataPackage.packageDate,
    portfolioCount: dataPackage.portfolio.length,
    watchlistCount: dataPackage.watchlist.length,
    marketSnapshot: dataPackage.marketSnapshot,
    dataQualitySummary: dataPackage.dataQualitySummary,
    mission: dataPackage.mission
  };
}

function isStaleRunningMission(startedAt: unknown) {
  if (!startedAt) return false;
  const started = new Date(String(startedAt)).getTime();
  return Number.isFinite(started) && Date.now() - started > 10 * 60 * 1000;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "未知錯誤";
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登入。" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const missionId = params.id;

  try {
    const { data: mission } = await supabase
      .from("missions")
      .select("id, status, started_at")
      .eq("id", missionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!mission) {
      return NextResponse.json({ error: "找不到任務。" }, { status: 404 });
    }

    if (String(mission.status) === "completed") {
      return NextResponse.json({ error: "任務已執行或正在執行中。" }, { status: 409 });
    }

    if (String(mission.status) === "running") {
      if (!isStaleRunningMission((mission as { started_at?: string | null }).started_at)) {
        return NextResponse.json({ error: "任務已執行或正在執行中。" }, { status: 409 });
      }

      await supabase
        .from("missions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: "先前分析逾時或中斷，已自動標記為失敗。"
        })
        .eq("id", missionId)
        .eq("user_id", user.id);
    }

    await supabase
      .from("missions")
      .update({ status: "running", started_at: new Date().toISOString(), error_message: null })
      .eq("id", missionId)
      .eq("user_id", user.id);

    await Promise.all([
      supabase.from("committee_decisions").delete().eq("mission_id", missionId).eq("user_id", user.id),
      supabase.from("division_decisions").delete().eq("mission_id", missionId).eq("user_id", user.id),
      supabase.from("team_reports").delete().eq("mission_id", missionId).eq("user_id", user.id)
    ]);

    const dataPackage = await buildMissionDataPackage(user.id, missionId);
    dataPackage.webResearch = await runWebResearch({
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
        })),
        ...dataPackage.mission.relatedSecurities.map((item) => ({
          symbol: item.symbol,
          name: item.name,
          market: item.market
        }))
      ]
    });

    if (dataPackage.mission.missionType === "single_stock") {
      const result = await runSingleStockMission({
        userId: user.id,
        missionId,
        dataPackage
      });

      await supabase
        .from("missions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          data_package: missionSummary(dataPackage)
        })
        .eq("id", missionId)
        .eq("user_id", user.id);

      return NextResponse.json({
        missionId,
        quickAnalysis: true,
        decision: result.decision,
        divisionDecisionId: result.divisionDecisionId
      });
    }

    const { data: divisionsData, error: divisionsError } = await supabase
      .from("divisions")
      .select("*")
      .eq("is_enabled", true)
      .eq("participates_in_committee", true)
      .order("sort_order", { ascending: true });

    if (divisionsError) throw new Error(divisionsError.message);

    const divisions = (divisionsData ?? []) as Division[];
    const divisionResults = await Promise.all(
      divisions.map((division) =>
        runDivisionPipeline({
          division,
          dataPackage,
          dailyRunId: null,
          userId: user.id,
          missionId
        })
      )
    );
    const committeeResult = await runCommitteePipeline({
      divisionResults,
      dataPackage,
      dailyRunId: null,
      userId: user.id,
      missionId
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
      .eq("mission_id", missionId);
    const teamReports = ((savedTeamReports ?? []) as Array<Record<string, unknown>>).map((row) => ({
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
    }));
    const familyId = await getFamilyId(user.id);

    await writeRecommendations({
      userId: user.id,
      familyId,
      dailyRunId: null,
      missionId,
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
      .from("missions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        data_package: missionSummary(dataPackage)
      })
      .eq("id", missionId)
      .eq("user_id", user.id);

    return NextResponse.json({
      missionId,
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
    await supabase
      .from("missions")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMessage(error)
      })
      .eq("id", missionId)
      .eq("user_id", user.id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任務分析失敗。" },
      { status: 500 }
    );
  }
}
