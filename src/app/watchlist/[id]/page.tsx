import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusLabel(status: string | null) {
  if (status === "觀察中") return "觀察中";
  if (status === "候選") return "候選";
  if (status === "暫不考慮") return "暫不考慮";
  return status ?? "-";
}

type AnalysisRow = {
  id: string;
  mission_id: string | null;
  source_type: string;
  recommendation_date: string | null;
  buy_zone_low: number | null;
  buy_zone_high: number | null;
  target_price: number | null;
  stop_loss: number | null;
  created_at: string;
};

function currencyForMarket(market: string) {
  return market === "US" ? "USD" : "TWD";
}

function priceText(value: number | null, currency: string) {
  return value === null ? "-" : formatCurrency(value, currency);
}

function priceRangeText(low: number | null, high: number | null, currency: string) {
  if (low === null && high === null) return "-";
  if (low !== null && high !== null && low !== high) {
    return `${formatCurrency(low, currency)} - ${formatCurrency(high, currency)}`;
  }

  return priceText(low ?? high, currency);
}

function targetPriceText(value: number | null, currency: string) {
  return `短期 - / 中期 ${priceText(value, currency)} / 長期 -`;
}

export default async function WatchlistDetailPage({ params }: { params: { id: string } }) {
  const authClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) notFound();

  const supabase = createSupabaseServiceClient();
  const { data: itemData } = await supabase
    .from("stocks_watchlist_items")
    .select(
      "id, visibility, reason, target_buy_price, alert_price, status, notes, created_at, securities:stocks_securities(id, symbol, market, name, security_type)"
    )
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!itemData) notFound();

  const item = itemData as unknown as {
    id: string;
    visibility: string;
    reason: string | null;
    target_buy_price: number | null;
    alert_price: number | null;
    status: string | null;
    notes: string | null;
    created_at: string;
    securities: {
      id: string;
      symbol: string;
      market: string;
      name: string;
      security_type: string;
    } | null;
  };

  const security = item.securities;
  if (!security) notFound();
  const currency = currencyForMarket(security.market);
  const { data: missionLinks } = await supabase
    .from("stocks_mission_links")
    .select("mission_id")
    .eq("user_id", user.id)
    .eq("watchlist_item_id", item.id);
  const missionIds = Array.from(
    new Set(((missionLinks ?? []) as Array<{ mission_id: string }>).map((link) => link.mission_id))
  );
  const { data: relatedMissions } = missionIds.length
    ? await supabase
        .from("stocks_missions")
        .select("id, title, status, created_at")
        .eq("user_id", user.id)
        .in("id", missionIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const { data: recommendationData, error: recommendationError } = await supabase
    .from("stocks_recommendations")
    .select(
      "id, mission_id, source_type, recommendation_date, buy_zone_low, buy_zone_high, target_price, stop_loss, created_at"
    )
    .eq("user_id", user.id)
    .eq("security_id", security.id)
    .order("created_at", { ascending: false });
  const recommendationRows = (recommendationError ? [] : recommendationData ?? []) as unknown as AnalysisRow[];
  const committeeRows = recommendationRows.filter((row) => row.source_type === "committee");
  const analysisRows = (committeeRows.length ? committeeRows : recommendationRows).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/watchlist">
          <Button type="button" variant="secondary" size="icon" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">
            {security.symbol}
            <span className="ml-2 text-slate-500">{security.name}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {security.market} / {security.security_type} / {statusLabel(item.status)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">目標買進價</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {item.target_buy_price !== null ? formatNumber(item.target_buy_price, 2) : "-"}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">警示價格</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {item.alert_price !== null ? formatNumber(item.alert_price, 2) : "-"}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">建立時間</div>
          <div className="mt-1 text-base font-medium text-slate-950">
            {formatDateTime(item.created_at)}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">關注理由</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {item.reason || "尚未填寫關注理由。"}
        </p>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">備註</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {item.notes || "尚未填寫備註。"}
        </p>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">相關任務</h2>
        {(relatedMissions ?? []).length ? (
          <div className="mt-3 divide-y divide-slate-100">
            {relatedMissions!.map((mission) => (
              <Link
                key={mission.id}
                href={`/missions/${mission.id}`}
                className="block py-3 first:pt-0 last:pb-0 hover:text-blue-700"
              >
                <div className="text-sm font-medium text-slate-950 hover:underline">
                  {mission.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {mission.status} / {formatDateTime(mission.created_at)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">目前沒有關聯任務。</p>
        )}
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Kevin 分析</h2>
        {analysisRows.length ? (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <Th>日期</Th>
                  <Th>可加倉價格</Th>
                  <Th>停損價格</Th>
                  <Th>短中長期價格目標</Th>
                </tr>
              </thead>
              <tbody>
                {analysisRows.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      {row.mission_id ? (
                        <Link
                          href={`/missions/${row.mission_id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {row.recommendation_date ?? formatDateTime(row.created_at)}
                        </Link>
                      ) : (
                        row.recommendation_date ?? formatDateTime(row.created_at)
                      )}
                    </Td>
                    <Td>{priceRangeText(row.buy_zone_low, row.buy_zone_high, currency)}</Td>
                    <Td>{priceText(row.stop_loss, currency)}</Td>
                    <Td>{targetPriceText(row.target_price, currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">目前沒有 Kevin 分析紀錄。</p>
        )}
      </section>
    </div>
  );
}
