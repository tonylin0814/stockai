import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Table, Td, Th } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ScoreRow = {
  id: string;
  entity_name: string;
  division: string | null;
  score_date: string;
  accuracy_score: number;
  return_score: number;
  risk_control_score: number;
  confidence_calibration_score: number;
  influence_points: number;
};

function latestRows(rows: ScoreRow[]) {
  const map = new Map<string, ScoreRow>();

  for (const row of rows) {
    const key = `${row.division ?? ""}:${row.entity_name}`;
    if (!map.has(key)) map.set(key, row);
  }

  return Array.from(map.values());
}

export default async function TeamPerformancePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("stocks_influence_scores")
    .select(
      "id, entity_name, division, score_date, accuracy_score, return_score, risk_control_score, confidence_calibration_score, influence_points"
    )
    .eq("user_id", user.id)
    .eq("entity_type", "team")
    .order("score_date", { ascending: false })
    .order("created_at", { ascending: false });
  const rows = latestRows((data ?? []) as ScoreRow[]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/performance" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          回績效中心
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">團隊績效</h1>
        <p className="mt-1 text-sm text-slate-600">比較各分析團隊的準確度、報酬、風控與信心校準。</p>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>團隊</Th>
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
          {rows.map((row) => (
            <tr key={row.id}>
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
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={8}>尚無團隊績效資料。</Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
    </div>
  );
}
