import Link from "next/link";
import { Activity, BarChart3, BrainCircuit, History } from "lucide-react";
import { UpdatePerformanceButton } from "@/components/update-performance-button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type InfluenceRow = {
  id: string;
  entity_type: string;
  entity_name: string;
  division: string | null;
  score_date: string;
  influence_points: number;
  accuracy_score: number;
  return_score: number;
  risk_control_score: number;
  confidence_calibration_score: number;
};

function latestByEntity(rows: InfluenceRow[]) {
  const map = new Map<string, InfluenceRow>();

  for (const row of rows) {
    const key = `${row.entity_type}:${row.division ?? ""}:${row.entity_name}`;
    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return Array.from(map.values());
}

function typeLabel(type: string) {
  if (type === "team") return "團隊";
  if (type === "division") return "Division";
  return "委員會";
}

export default async function PerformancePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: influenceData }, { count: outcomeCount }] = await Promise.all([
    supabase
      .from("influence_scores")
      .select(
        "id, entity_type, entity_name, division, score_date, influence_points, accuracy_score, return_score, risk_control_score, confidence_calibration_score"
      )
      .eq("user_id", user.id)
      .order("score_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("recommendation_outcomes")
      .select("id, recommendations!inner(user_id)", { count: "exact", head: true })
      .eq("recommendations.user_id", user.id)
  ]);
  const latestScores = latestByEntity((influenceData ?? []) as InfluenceRow[]);
  const counts = {
    team: latestScores.filter((row) => row.entity_type === "team").length,
    division: latestScores.filter((row) => row.entity_type === "division").length,
    committee: latestScores.filter((row) => row.entity_type === "committee").length
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">績效中心</h1>
          <p className="mt-1 text-sm text-slate-600">追蹤建議結果、影響力分數與歷史表現。</p>
        </div>
        <UpdatePerformanceButton />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Link href="/performance/teams" className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
          <BrainCircuit className="mb-3 h-5 w-5 text-slate-700" />
          <p className="text-sm text-slate-600">團隊</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{counts.team}</p>
        </Link>
        <Link href="/performance/divisions" className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
          <BarChart3 className="mb-3 h-5 w-5 text-slate-700" />
          <p className="text-sm text-slate-600">Division</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{counts.division}</p>
        </Link>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <Activity className="mb-3 h-5 w-5 text-slate-700" />
          <p className="text-sm text-slate-600">委員會</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{counts.committee}</p>
        </div>
        <Link href="/performance/history" className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
          <History className="mb-3 h-5 w-5 text-slate-700" />
          <p className="text-sm text-slate-600">已評估結果</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{outcomeCount ?? 0}</p>
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">最新影響力</h2>
        <Table>
          <thead>
            <tr>
              <Th>類型</Th>
              <Th>名稱</Th>
              <Th>Division</Th>
              <Th>影響力</Th>
              <Th>準確</Th>
              <Th>報酬</Th>
              <Th>風控</Th>
              <Th>校準</Th>
              <Th>日期</Th>
            </tr>
          </thead>
          <tbody>
            {latestScores.map((row) => (
              <tr key={row.id}>
                <Td>{typeLabel(row.entity_type)}</Td>
                <Td>{row.entity_name}</Td>
                <Td>{row.division ?? "—"}</Td>
                <Td>{formatNumber(row.influence_points, 1)}</Td>
                <Td>{formatNumber(row.accuracy_score, 1)}</Td>
                <Td>{formatNumber(row.return_score, 1)}</Td>
                <Td>{formatNumber(row.risk_control_score, 1)}</Td>
                <Td>{formatNumber(row.confidence_calibration_score, 1)}</Td>
                <Td>{row.score_date}</Td>
              </tr>
            ))}
            {latestScores.length === 0 ? (
              <tr>
                <Td colSpan={9}>尚無績效資料。</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
