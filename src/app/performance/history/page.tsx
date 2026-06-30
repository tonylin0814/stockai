import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PerformanceHistoryFilters } from "@/components/performance-history-filters";
import RecommendationRating from "@/components/recommendation-rating";
import { Table, Td, Th } from "@/components/ui/table";
import { formatNumber, formatSignedPercent } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = {
  source_type?: string;
  action?: string;
  market?: string;
  from?: string;
  to?: string;
};

type OutcomeRow = {
  id: string;
  evaluation_date: string;
  horizon_days: number;
  start_price: number | null;
  end_price: number | null;
  return_pct: number | null;
  max_drawdown_pct: number | null;
  hit_target: boolean | null;
  hit_stop_loss: boolean | null;
  direction_correct: boolean | null;
  missed_opportunity: boolean | null;
  score_delta: number | null;
  recommendations: {
    id: string;
    source_type: string;
    source_name: string;
    division: string | null;
    team_name: string | null;
    action: string;
    confidence: number;
    reason: string | null;
    user_rating: string | null;
    target_price: number | null;
    stop_loss: number | null;
    securities: { symbol: string; market: string; name: string } | null;
  } | null;
};

function resultLabel(value: boolean | null) {
  if (value === true) return "是";
  if (value === false) return "否";
  return "—";
}

function srcLabel(t: string) {
  return t === "committee" ? "投資委員會" : t === "division" ? "AI 快速分析" : "AI 分析團隊";
}

function matchesFilters(row: OutcomeRow, params: SearchParams) {
  const recommendation = row.recommendations;
  const security = recommendation?.securities;

  if (params.source_type && recommendation?.source_type !== params.source_type) return false;
  if (params.action && recommendation?.action !== params.action) return false;
  if (params.market && security?.market !== params.market) return false;
  if (params.from && row.evaluation_date < params.from) return false;
  if (params.to && row.evaluation_date > params.to) return false;

  return true;
}

export default async function PerformanceHistoryPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("recommendation_outcomes")
    .select(
      "id, evaluation_date, horizon_days, start_price, end_price, return_pct, max_drawdown_pct, hit_target, hit_stop_loss, direction_correct, missed_opportunity, score_delta, recommendations!inner(id, source_type, source_name, division, team_name, action, confidence, reason, user_rating, target_price, stop_loss, user_id, securities(symbol, market, name))"
    )
    .eq("recommendations.user_id", user.id)
    .order("evaluation_date", { ascending: false })
    .limit(200);
  const rows = ((data ?? []) as unknown as OutcomeRow[]).filter((row) =>
    matchesFilters(row, searchParams)
  );

  return (
    <div className="space-y-5">
      <div>
        <Link href="/performance" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          回績效中心
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">績效歷史</h1>
        <p className="mt-1 text-sm text-slate-600">檢視每一筆建議在 7、30、90 天後的結果。</p>
      </div>

      <Suspense>
        <PerformanceHistoryFilters />
      </Suspense>

      <Table>
        <thead>
          <tr>
            <Th>日期</Th>
            <Th>天數</Th>
            <Th>代號</Th>
            <Th>市場</Th>
            <Th>來源</Th>
            <Th>動作</Th>
            <Th>信心</Th>
            <Th>起始</Th>
            <Th>結束</Th>
            <Th>報酬</Th>
            <Th>回撤</Th>
            <Th>方向</Th>
            <Th>達標</Th>
            <Th>停損</Th>
            <Th>錯失</Th>
            <Th>分數</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const recommendation = row.recommendations;
            const security = recommendation?.securities;

            return (
              <tr key={row.id}>
                <Td>{row.evaluation_date}</Td>
                <Td>{row.horizon_days}</Td>
                <Td>{security?.symbol ?? "—"}</Td>
                <Td>{security?.market ?? "—"}</Td>
                <Td>
                  {recommendation ? (
                    <div className="min-w-0 space-y-2">
                      <div className="break-words">
                        {srcLabel(recommendation.source_type)}
                      </div>
                      <p className="max-w-md break-words text-xs text-slate-500">
                        {recommendation.reason ?? "—"}
                      </p>
                      <RecommendationRating
                        recommendationId={recommendation.id}
                        currentRating={recommendation.user_rating ?? null}
                      />
                    </div>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{recommendation?.action ?? "—"}</Td>
                <Td>{recommendation?.confidence ?? "—"}</Td>
                <Td>{row.start_price === null ? "—" : formatNumber(row.start_price, 2)}</Td>
                <Td>{row.end_price === null ? "—" : formatNumber(row.end_price, 2)}</Td>
                <Td>{row.return_pct === null ? "—" : formatSignedPercent(row.return_pct)}</Td>
                <Td>{row.max_drawdown_pct === null ? "—" : formatSignedPercent(row.max_drawdown_pct)}</Td>
                <Td>{resultLabel(row.direction_correct)}</Td>
                <Td>{resultLabel(row.hit_target)}</Td>
                <Td>{resultLabel(row.hit_stop_loss)}</Td>
                <Td>{resultLabel(row.missed_opportunity)}</Td>
                <Td>{row.score_delta === null ? "—" : formatNumber(row.score_delta, 1)}</Td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={16}>沒有符合條件的績效資料。</Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
    </div>
  );
}
