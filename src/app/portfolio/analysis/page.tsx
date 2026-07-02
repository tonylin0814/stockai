import Link from "next/link";
import { notFound } from "next/navigation";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusClass(status: string) {
  if (status === "completed") return "border-green-200 bg-green-50 text-green-800";
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "cancelled") return "border-slate-200 bg-slate-100 text-slate-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-800";
  return "border-yellow-200 bg-yellow-50 text-yellow-800";
}

function statusLabel(status: string) {
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
  return type || "-";
}

type PortfolioAnalysisRow = {
  id: string;
  mission_id: string;
  security_id: string | null;
  created_at: string;
  portfolio_holding_id: string | null;
};

export default async function PortfolioAnalysisPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data, error } = await supabase
    .from("stocks_mission_links")
    .select("id, mission_id, security_id, created_at, portfolio_holding_id")
    .eq("user_id", user.id)
    .eq("link_type", "portfolio")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as PortfolioAnalysisRow[];
  const missionIds = Array.from(new Set(rows.map((row) => row.mission_id).filter(Boolean)));
  const securityIds = Array.from(
    new Set(rows.map((row) => row.security_id).filter((id): id is string => Boolean(id)))
  );
  const [missionsResult, securitiesResult] = await Promise.all([
    missionIds.length
      ? supabase
          .from("stocks_missions")
          .select("id, title, mission_type, status, created_at")
          .eq("user_id", user.id)
          .in("id", missionIds)
      : Promise.resolve({ data: [], error: null }),
    securityIds.length
      ? supabase
          .from("stocks_securities")
          .select("id, symbol, market, name")
          .in("id", securityIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const lookupError = missionsResult.error ?? securitiesResult.error;
  if (lookupError) {
    throw new Error(lookupError.message);
  }

  const missionsById = new Map(
    ((missionsResult.data ?? []) as Array<{
      id: string;
      title: string;
      mission_type: string | null;
      status: string;
      created_at: string;
    }>).map((mission) => [mission.id, mission])
  );
  const securitiesById = new Map(
    ((securitiesResult.data ?? []) as Array<{
      id: string;
      symbol: string;
      market: string;
      name: string;
    }>).map((security) => [security.id, security])
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">我的投資分析</h1>
        <p className="mt-1 text-sm text-slate-600">
          這裡會顯示所有已關聯到 portfolio 持股的股票分析。
        </p>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>股票</Th>
            <Th>標題</Th>
            <Th>類型</Th>
            <Th>狀態</Th>
            <Th>建立時間</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => {
              const mission = missionsById.get(row.mission_id);
              const security = row.security_id ? securitiesById.get(row.security_id) : null;

              return (
                <tr key={row.id}>
                  <Td>
                    <div className="font-medium text-slate-950">
                      {security?.symbol ?? "-"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {[security?.market, security?.name].filter(Boolean).join(" / ") || "-"}
                    </div>
                  </Td>
                  <Td>
                    {mission ? (
                      <Link
                        href={`/missions/${mission.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {mission.title}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td>{missionTypeLabel(mission?.mission_type ?? null)}</Td>
                  <Td>
                    {mission ? (
                      <span
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs font-medium",
                          statusClass(mission.status)
                        )}
                      >
                        {statusLabel(mission.status)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td>{mission ? formatDateTime(mission.created_at) : "-"}</Td>
                </tr>
              );
            })
          ) : (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-slate-500">
                目前沒有 portfolio 股票分析紀錄。
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
