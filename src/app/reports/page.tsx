import Link from "next/link";
import { Table, Td, Th } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DailyRunSummary = {
  id: string;
  run_date: string;
  status: string;
  created_at: string;
  committee_decisions: Array<{
    final_action: string;
    consensus_level: string;
    confidence: number | null;
    is_action_allowed: boolean;
  }>;
};

const statusLabel: Record<string, string> = {
  completed: "完成",
  running: "執行中",
  failed: "失敗"
};

export default async function ReportsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("daily_runs")
    .select("id, run_date, status, created_at, committee_decisions(final_action, consensus_level, confidence, is_action_allowed)")
    .eq("user_id", user.id)
    .order("run_date", { ascending: false })
    .limit(90);
  const runs = (data ?? []) as unknown as DailyRunSummary[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-950">歷史報告</h1>
      {runs.length === 0 ? <p className="text-sm text-slate-500">尚無報告記錄。</p> : null}
      <Table>
        <thead>
          <tr>
            <Th>日期</Th>
            <Th>狀態</Th>
            <Th>委員會決議</Th>
            <Th>共識</Th>
            <Th>信心度</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const committee = run.committee_decisions?.[0];

            return (
              <tr key={run.id}>
                <Td>{run.run_date}</Td>
                <Td>{statusLabel[run.status] ?? run.status}</Td>
                <Td>{committee?.final_action ?? "—"}</Td>
                <Td>{committee?.consensus_level ?? "—"}</Td>
                <Td>{committee?.confidence != null ? `${committee.confidence}%` : "—"}</Td>
                <Td>
                  {run.status === "completed" ? (
                    <Link href={`/reports/${run.id}`} className="text-sm text-slate-600 underline hover:text-slate-950">
                      查看
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
