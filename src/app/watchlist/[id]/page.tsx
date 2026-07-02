import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function statusLabel(status: string | null) {
  if (status === "觀察中") return "觀察中";
  if (status === "候選") return "候選";
  if (status === "暫不考慮") return "暫不考慮";
  return status ?? "-";
}

export default async function WatchlistDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

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
    </div>
  );
}
