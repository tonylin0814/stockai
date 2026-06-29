import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { RunMissionButton } from "@/components/run-mission-button";
import { TeamReportTabs } from "@/components/team-report-tabs";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function consensusClass(level: string | null) {
  if (level === "strong") return "border-green-200 bg-green-50 text-green-800";
  if (level === "weak") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function addDays(value: string | null, days: number) {
  if (!value) return null;
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function isStaleRunningMission(startedAt: unknown) {
  if (!startedAt) return false;
  const started = new Date(String(startedAt)).getTime();
  return Number.isFinite(started) && Date.now() - started > 10 * 60 * 1000;
}

export default async function MissionResultPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!mission) notFound();

  const missionRow = mission as Record<string, unknown>;
  let status = String(missionRow.status ?? "pending");

  if (status === "running" && isStaleRunningMission(missionRow.started_at)) {
    await supabase
      .from("missions")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: "先前分析逾時或中斷，已自動標記為失敗。"
      })
      .eq("id", params.id)
      .eq("user_id", user.id);
    status = "failed";
    missionRow.status = "failed";
    missionRow.completed_at = new Date().toISOString();
    missionRow.error_message = "先前分析逾時或中斷，已自動標記為失敗。";
  }

  const detailSection = (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-950">{String(missionRow.title)}</h1>
      <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
        <p>原始問題：{String(missionRow.original_question ?? "—")}</p>
        <p>任務類型：{String(missionRow.mission_type ?? "—")}</p>
        <p>相關代號：{Array.isArray(missionRow.related_symbols) ? missionRow.related_symbols.join(", ") : "—"}</p>
        <p>建立時間：{formatDateTime(String(missionRow.created_at ?? ""))}</p>
        <p>完成時間：{missionRow.completed_at ? formatDateTime(String(missionRow.completed_at)) : "—"}</p>
        <p>狀態：{status}</p>
      </div>
    </section>
  );

  if (status === "pending") {
    return (
      <div className="space-y-5">
        {detailSection}
        <RunMissionButton missionId={params.id} />
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="space-y-5">
        <AutoRefresh />
        {detailSection}
        <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">任務分析執行中…頁面每 10 秒自動更新。</p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-5">
        {detailSection}
        <div className="rounded-md border border-red-200 bg-red-50 p-6">
          <h2 className="text-xl font-semibold text-red-900">任務分析失敗</h2>
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">任務失敗</p>
            <p className="mt-1 break-words text-sm text-red-700">
              {String(missionRow.error_message ?? "未知錯誤")}
            </p>
          </div>
          <div className="mt-4">
            <RunMissionButton missionId={params.id} label="重新執行分析" />
          </div>
        </div>
      </div>
    );
  }

  const [committeeResult, divisionResult, teamResult, recommendationResult] =
    await Promise.all([
      supabase
        .from("committee_decisions")
        .select("*")
        .eq("mission_id", params.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("division_decisions")
        .select("*")
        .eq("mission_id", params.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("team_reports")
        .select("id, division, team_name, market_view, portfolio_review, final_team_view")
        .eq("mission_id", params.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("recommendations")
        .select("id, source_type, source_name, action, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, securities(symbol, market)")
        .eq("mission_id", params.id)
        .order("created_at", { ascending: true })
    ]);
  const committee = committeeResult.data as Record<string, unknown> | null;
  const divisions = (divisionResult.data ?? []) as Array<Record<string, unknown>>;
  const teams = (teamResult.data ?? []) as Parameters<typeof TeamReportTabs>[0]["reports"];
  const recommendations = (recommendationResult.data ?? []) as unknown as Array<{
    id: string;
    source_type: string;
    source_name: string;
    action: string;
    confidence: number;
    buy_zone_low: number | null;
    buy_zone_high: number | null;
    target_price: number | null;
    stop_loss: number | null;
    securities: { symbol: string; market: string } | null;
  }>;
  const recommendationIds = recommendations.map((recommendation) => recommendation.id);
  const { data: outcomes } = recommendationIds.length
    ? await supabase
        .from("recommendation_outcomes")
        .select("horizon_days")
        .in("recommendation_id", recommendationIds)
    : { data: [] };
  const outcomeHorizons = new Set(((outcomes ?? []) as Array<{ horizon_days: number }>).map((row) => row.horizon_days));
  const completedAt = missionRow.completed_at ? String(missionRow.completed_at) : null;

  return (
    <div className="space-y-8">
      {detailSection}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">委員會決策</h2>
          <span className={`rounded-md border px-2 py-1 text-sm font-medium ${consensusClass(String(committee?.consensus_level ?? "none"))}`}>
            {String(committee?.consensus_level ?? "none")}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <p>Final action：{String(committee?.final_action ?? "—")}</p>
          <p>Action type：{String(committee?.action_type ?? "—")}</p>
          <p>允許行動：{committee?.is_action_allowed ? "是" : "否"}</p>
          <p>信心分數：{String(committee?.confidence ?? "—")}</p>
        </div>
        <p className="mt-4 text-sm text-slate-700">{String(committee?.decision_summary ?? "—")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Division 比較</h2>
        <Table>
          <thead>
            <tr>
              <Th>Division</Th>
              <Th>Manager</Th>
              <Th>建議</Th>
              <Th>信心</Th>
              <Th>支持 Teams</Th>
              <Th>反對 Teams</Th>
            </tr>
          </thead>
          <tbody>
            {divisions.map((division) => (
              <tr key={String(division.id)}>
                <Td>{String(division.division ?? "—")}</Td>
                <Td>{String(division.division_manager ?? "—")}</Td>
                <Td>{String(division.decision_action ?? "—")}</Td>
                <Td>{String(division.confidence ?? "—")}</Td>
                <Td>{Array.isArray(division.supporting_teams) ? division.supporting_teams.join(", ") : "—"}</Td>
                <Td>{Array.isArray(division.opposing_teams) ? division.opposing_teams.join(", ") : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Team Reports</h2>
        <TeamReportTabs reports={teams} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">任務建議</h2>
        <Table>
          <thead>
            <tr>
              <Th>代號</Th>
              <Th>市場</Th>
              <Th>來源</Th>
              <Th>行動</Th>
              <Th>信心</Th>
              <Th>買進區間</Th>
              <Th>目標價</Th>
              <Th>停損</Th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((recommendation) => (
              <tr key={recommendation.id}>
                <Td>{recommendation.securities?.symbol ?? "—"}</Td>
                <Td>{recommendation.securities?.market ?? "—"}</Td>
                <Td>{recommendation.source_type} / {recommendation.source_name}</Td>
                <Td>{recommendation.action}</Td>
                <Td>{recommendation.confidence}</Td>
                <Td>{recommendation.buy_zone_low ?? "—"} - {recommendation.buy_zone_high ?? "—"}</Td>
                <Td>{recommendation.target_price ?? "—"}</Td>
                <Td>{recommendation.stop_loss ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">後續追蹤</h2>
        <Table>
          <thead>
            <tr>
              <Th>追蹤週期</Th>
              <Th>評估日期</Th>
              <Th>狀態</Th>
            </tr>
          </thead>
          <tbody>
            {[7, 30, 90].map((days) => {
              const evaluationDate = addDays(completedAt, days);
              const due = evaluationDate ? evaluationDate.getTime() <= Date.now() : false;
              const statusText = !due ? "待評估" : outcomeHorizons.has(days) ? "已到期" : "未追蹤";
              return (
                <tr key={days}>
                  <Td>{days}日後追蹤</Td>
                  <Td>{evaluationDate ? formatDateTime(evaluationDate.toISOString()) : "—"}</Td>
                  <Td>{statusText}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
