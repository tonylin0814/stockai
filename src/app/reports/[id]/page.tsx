import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: { id: string };
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function committeeLabel(committee: Record<string, unknown>) {
  return committee.model_provider === "Anthropic" ? "Committee B · Claude" : "Committee A · GPT";
}

export default async function ReportDetailPage({ params }: PageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: run }, { data: committees }, { data: divisions }] = await Promise.all([
    supabase
      .from("stocks_daily_runs")
      .select("id, run_date, status")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("stocks_committee_decisions")
      .select("*")
      .eq("daily_run_id", params.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("stocks_division_decisions")
      .select("*")
      .eq("daily_run_id", params.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
  ]);

  if (!run) notFound();

  const committeeRows = (committees ?? []) as Array<Record<string, unknown>>;
  const divisionRows = (divisions ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-sm text-slate-600 underline hover:text-slate-950">
        ← 歷史報告
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-slate-950">報告 {String(run.run_date)}</h1>
        <p className="mt-1 text-sm text-slate-600">狀態：{String(run.status)}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">委員會決策</h2>
        {committeeRows.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {committeeRows.map((committee) => (
              <div key={String(committee.id)} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-950">{committeeLabel(committee)}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  產生時間：{committee.created_at ? formatDateTime(String(committee.created_at)) : "—"}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <p>Final action：{valueText(committee.final_action)}</p>
                  <p>Action type：{valueText(committee.action_type)}</p>
                  <p>共識等級：{valueText(committee.consensus_level)}</p>
                  <p>信心分數：{valueText(committee.confidence)}</p>
                  <p>允許行動：{committee.is_action_allowed ? "是" : "否"}</p>
                </div>
                <p className="mt-4 break-words text-sm text-slate-700">
                  {valueText(committee.decision_summary)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            尚無委員會決策。
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {divisionRows.map((division) => (
          <div key={String(division.id)} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">{valueText(division.division)}</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>Manager：{valueText(division.division_manager)}</p>
              <p>建議：{valueText(division.decision_action)}</p>
              <p>信心：{valueText(division.confidence)}</p>
              <p className="break-words">摘要：{valueText(division.market_summary)}</p>
              <p>支持 Teams：{valueText(division.supporting_teams)}</p>
              <p>反對 Teams：{valueText(division.opposing_teams)}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
