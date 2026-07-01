import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function statusLabel(status: string | null) {
  if (status === "觀察中") return "觀察中";
  if (status === "候選") return "候選";
  if (status === "暫不考慮") return "暫不考慮";
  return status ?? "—";
}

function missionStatusLabel(status: string) {
  if (status === "completed") return "完成";
  if (status === "running") return "執行中";
  if (status === "cancelled") return "已取消";
  if (status === "failed") return "失敗";
  return "待執行";
}

function missionTypeLabel(type: string | null) {
  if (type === "single_stock") return "單一股票分析";
  if (type === "multi_stock") return "多股票比較";
  if (type === "portfolio_review") return "投資組合檢視";
  if (type === "watchlist_review") return "關注清單檢視";
  if (type === "theme") return "主題研究";
  if (type === "event") return "事件分析";
  return type ?? "—";
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

  const { data: linkedRows } = await supabase
    .from("stocks_mission_links")
    .select("missions:stocks_missions(id, title, mission_type, status, created_at, completed_at)")
    .eq("user_id", user.id)
    .eq("watchlist_item_id", params.id)
    .order("created_at", { ascending: false });

  const missions = ((linkedRows ?? []) as unknown as Array<{
    missions: {
      id: string;
      title: string;
      mission_type: string | null;
      status: string;
      created_at: string;
      completed_at: string | null;
    } | null;
  }>)
    .map((row) => row.missions)
    .filter(Boolean) as Array<{
    id: string;
    title: string;
    mission_type: string | null;
    status: string;
    created_at: string;
    completed_at: string | null;
  }>;

  const security = item.securities;
  if (!security) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/watchlist">
          <Button type="button" variant="secondary" size="icon" aria-label="返回">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">
            {security.symbol}
            <span className="ml-2 text-slate-500">{security.name}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {security.market} · {security.security_type} · {statusLabel(item.status)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">目標買進價</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {item.target_buy_price !== null ? formatNumber(item.target_buy_price, 2) : "—"}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">警示價格</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {item.alert_price !== null ? formatNumber(item.alert_price, 2) : "—"}
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">相關任務</h2>
          <p className="mt-1 text-sm text-slate-600">建立任務時關聯到此關注項目的分析紀錄。</p>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>任務</Th>
              <Th>類型</Th>
              <Th>狀態</Th>
              <Th>建立時間</Th>
              <Th>完成時間</Th>
            </tr>
          </thead>
          <tbody>
            {missions.length ? (
              missions.map((mission) => (
                <tr key={mission.id}>
                  <Td>
                    <Link href={`/missions/${mission.id}`} className="font-medium text-blue-700 hover:underline">
                      {mission.title}
                    </Link>
                  </Td>
                  <Td>{missionTypeLabel(mission.mission_type)}</Td>
                  <Td>{missionStatusLabel(mission.status)}</Td>
                  <Td>{formatDateTime(mission.created_at)}</Td>
                  <Td>{mission.completed_at ? formatDateTime(mission.completed_at) : "—"}</Td>
                </tr>
              ))
            ) : (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-slate-500">
                  尚未關聯任何任務。
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
