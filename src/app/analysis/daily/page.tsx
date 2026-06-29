import { RunAnalysisButton } from "@/components/run-analysis-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { TeamReportTabs } from "@/components/team-report-tabs";
import { Table, Td, Th } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function consensusClass(level: string | null) {
  if (level === "strong") return "border-green-200 bg-green-50 text-green-800";
  if (level === "weak") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  return "border-red-200 bg-red-50 text-red-800";
}

export default async function DailyAnalysisPage() {
  const supabase = createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  if (!user) return null;

  const today = todayIsoDate();
  let run: Record<string, unknown> | null = null;

  try {
    const result = await supabase
      .from("daily_runs")
      .select("*")
      .eq("user_id", user.id)
      .eq("run_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    run = (result.data as Record<string, unknown> | null) ?? null;
  } catch {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-semibold text-red-900">每日分析讀取失敗</h1>
        <p className="mt-2 text-sm text-red-700">請稍後重新整理頁面或重新執行分析。</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">每日分析</h1>
        <p className="mt-2 text-sm text-slate-600">今日尚未執行分析。</p>
        <div className="mt-4">
          <RunAnalysisButton />
        </div>
      </div>
    );
  }

  const runId = String(run.id);

  if (run.status === "running") {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <AutoRefresh />
        <h1 className="text-2xl font-semibold text-slate-950">每日分析</h1>
        <p className="mt-2 text-sm text-slate-600">分析執行中…頁面每 10 秒自動更新。</p>
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-semibold text-red-900">每日分析失敗</h1>
        <p className="mt-2 text-sm text-red-700">請檢查伺服器紀錄後重新執行。</p>
        <div className="mt-4">
          <RunAnalysisButton label="重新執行分析" />
        </div>
      </div>
    );
  }

  let committeeResult;
  let divisionResult;
  let teamResult;
  let recommendationResult;

  try {
    [committeeResult, divisionResult, teamResult, recommendationResult] =
      await Promise.all([
        supabase
          .from("committee_decisions")
          .select("*")
          .eq("daily_run_id", runId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("division_decisions")
          .select("*")
          .eq("daily_run_id", runId)
          .order("created_at", { ascending: true }),
        supabase
          .from("team_reports")
          .select("id, division, team_name, market_view, portfolio_review, final_team_view")
          .eq("daily_run_id", runId)
          .order("created_at", { ascending: true }),
        supabase
          .from("recommendations")
          .select("id, source_type, source_name, action, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, securities(symbol, market)")
          .eq("daily_run_id", runId)
          .order("created_at", { ascending: true })
      ]);
  } catch {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-semibold text-red-900">每日分析結果讀取失敗</h1>
        <p className="mt-2 text-sm text-red-700">資料庫暫時無法回傳完整結果，請稍後重新整理。</p>
      </div>
    );
  }
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">每日分析</h1>
        <p className="mt-1 text-sm text-slate-600">今日分析結果與建議。</p>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">委員會決策</h2>
          <span
            className={`rounded-md border px-2 py-1 text-sm font-medium ${consensusClass(
              String(committee?.consensus_level ?? "none")
            )}`}
          >
            {String(committee?.consensus_level ?? "none")}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <p>Final action：{String(committee?.final_action ?? "—")}</p>
          <p>Action type：{String(committee?.action_type ?? "—")}</p>
          <p>允許行動：{committee?.is_action_allowed ? "是" : "否"}</p>
          <p>信心分數：{String(committee?.confidence ?? "—")}</p>
        </div>
        <p className="mt-4 text-sm text-slate-700">
          {String(committee?.decision_summary ?? "—")}
        </p>
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
        <h2 className="text-xl font-semibold text-slate-950">今日建議</h2>
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
                <Td>
                  {recommendation.buy_zone_low ?? "—"} - {recommendation.buy_zone_high ?? "—"}
                </Td>
                <Td>{recommendation.target_price ?? "—"}</Td>
                <Td>{recommendation.stop_loss ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
