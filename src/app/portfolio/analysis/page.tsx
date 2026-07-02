import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { TeamReportTabs } from "@/components/team-report-tabs";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function actionLabel(value: unknown) {
  const action = String(value ?? "");
  const labels: Record<string, string> = {
    buy: "買進",
    small_buy: "小買",
    add: "加碼",
    hold: "持有",
    wait: "等待",
    reduce: "減碼",
    sell: "賣出",
    avoid: "避開",
    no_action: "不行動"
  };
  return labels[action] ?? (action || "-");
}

function consensusClass(level: string | null) {
  if (level === "strong") return "border-green-200 bg-green-50 text-green-800";
  if (level === "weak") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function modelLabel(division: Record<string, unknown>) {
  return String(division.division ?? division.model_provider ?? "模型");
}

function advisorProfile(value: unknown) {
  const text = String(value ?? "");

  if (text.includes("Claire") || text.includes("Anthropic") || text.includes("Claude")) {
    return { name: "Claire", image: "/advisors/claire.png" };
  }

  return { name: "Monica", image: "/advisors/monica.png" };
}

const committeeAdvisor = { name: "Kevin", image: "/advisors/kevin.png" };

function advisorTitle(advisor: { name: string }) {
  return advisor.name === "Claire" ? "Claire 經理 - Claude" : "Monica 經理 - GPT";
}

function confidenceRange(rows: Array<Record<string, unknown>>) {
  const values = rows
    .map((row) => Number(row.confidence))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return "信心區間：-";
  return `信心區間：${Math.min(...values)} - ${Math.max(...values)}`;
}

function asPortfolioActions(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item)).filter((item) => Object.keys(item).length)
    : [];
}

export default async function PortfolioAnalysisPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: run, error: runError } = await supabase
    .from("stocks_daily_runs")
    .select("id, run_date, status, started_at, completed_at, created_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("run_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) throw new Error(runError.message);

  if (!run) {
    return (
      <div className="space-y-5">
        <Link
          href="/portfolio"
          className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          返回投資組合
        </Link>
        <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">投資組合分析</h1>
          <p className="mt-2 text-sm text-slate-600">目前沒有已保存的投資組合分析報告。</p>
        </section>
      </div>
    );
  }

  const runId = String(run.id);
  const [committeeResult, divisionResult, teamResult] = await Promise.all([
    supabase
      .from("stocks_committee_decisions")
      .select("*")
      .eq("daily_run_id", runId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("stocks_division_decisions")
      .select("*")
      .eq("daily_run_id", runId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("stocks_team_reports")
      .select("id, division, team_name, market_view, portfolio_review, final_team_view")
      .eq("daily_run_id", runId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
  ]);

  const resultError = committeeResult.error ?? divisionResult.error ?? teamResult.error;
  if (resultError) throw new Error(resultError.message);

  const committees = (committeeResult.data ?? []) as Array<Record<string, unknown>>;
  const divisions = (divisionResult.data ?? []) as Array<Record<string, unknown>>;
  const teams = (teamResult.data ?? []) as Parameters<typeof TeamReportTabs>[0]["reports"];

  return (
    <div className="space-y-8">
      <Link
        href="/portfolio"
        className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
      >
        返回投資組合
      </Link>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">投資組合分析</h1>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>分析日期：{String(run.run_date ?? "-")}</p>
          <p>狀態：完成</p>
          <p>開始時間：{run.started_at ? formatDateTime(String(run.started_at)) : "-"}</p>
          <p>完成時間：{run.completed_at ? formatDateTime(String(run.completed_at)) : "-"}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">委員會決策</h2>
          <p className="mt-1 text-sm text-slate-500">{confidenceRange(committees)}</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {committees.length ? (
            committees.map((item, index) => {
              const provider = String(item.model_provider ?? "");
              const label = "Kevin 委員 - Codex";

              return (
                <article key={`${provider}-${index}`} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Image
                        src={committeeAdvisor.image}
                        alt={committeeAdvisor.name}
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
                      />
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">{label}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(String(item.created_at ?? ""))}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-xs font-medium ${consensusClass(String(item.consensus_level ?? "none"))}`}>
                      {String(item.consensus_level ?? "none")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">建議</p>
                      <p className="font-medium text-slate-950">{actionLabel(item.action_type)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">信心</p>
                      <p className="font-medium text-slate-950">{String(item.confidence ?? "-")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">允許行動</p>
                      <p className="font-medium text-slate-950">{item.is_action_allowed ? "是" : "否"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">最終動作</p>
                      <p className="font-medium text-slate-950">{actionLabel(item.final_action)}</p>
                    </div>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {String(item.decision_summary ?? "-")}
                  </p>
                </article>
              );
            })
          ) : (
            <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              尚無委員會決策。
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">模型分析對照</h2>
          <div className="mt-2 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            <p>{confidenceRange(divisions)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {divisions.map((division) => {
            const actions = asPortfolioActions(division.portfolio_actions);
            const advisor = advisorProfile(division.division_manager ?? division.model_provider ?? division.division);

            return (
              <article key={`division-${String(division.id)}`} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src={advisor.image}
                      alt={advisor.name}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
                    />
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">{advisorTitle(advisor)}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {modelLabel(division)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">{actionLabel(division.decision_action)}</p>
                    <p className="text-xs text-slate-500">信心 {String(division.confidence ?? "-")}</p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {String(division.market_summary ?? "-")}
                </p>
                {actions.length ? (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-slate-800">持股動作</p>
                    <Table>
                      <thead>
                        <tr>
                          <Th>代號</Th>
                          <Th>建議</Th>
                          <Th>理由</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {actions.slice(0, 6).map((item, index) => (
                          <tr key={index}>
                            <Td>{String(item.symbol ?? item.name ?? "-")}</Td>
                            <Td>{actionLabel(item.action)}</Td>
                            <Td>{String(item.reason ?? "-")}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Team Reports</h2>
        <TeamReportTabs reports={teams} />
      </section>
    </div>
  );
}
