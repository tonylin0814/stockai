import Link from "next/link";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

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

function missionTypeLabel(type: string) {
  if (type === "single_stock") return "單一股票分析";
  if (type === "multi_stock") return "多股票比較";
  if (type === "portfolio_review") return "投資組合檢視";
  if (type === "watchlist_review") return "關注清單檢視";
  if (type === "theme") return "主題研究";
  if (type === "event") return "事件分析";
  return type || "-";
}

export default async function MissionsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: missions, error } = await supabase
    .from("stocks_missions")
    .select("id, title, mission_type, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">任務中心</h1>
        <p className="mt-1 text-sm text-slate-600">查看過去任務與已保存的決策結果。</p>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>標題</Th>
            <Th>類型</Th>
            <Th>狀態</Th>
            <Th>建立時間</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {(missions ?? []).length ? (
            missions!.map((mission) => (
              <tr key={mission.id}>
                <Td>{mission.title}</Td>
                <Td>{missionTypeLabel(mission.mission_type)}</Td>
                <Td>
                  <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", statusClass(mission.status))}>
                    {statusLabel(mission.status)}
                  </span>
                </Td>
                <Td>{formatDateTime(mission.created_at)}</Td>
                <Td>
                  <Link
                    href={`/missions/${mission.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  >
                    查看
                  </Link>
                </Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-slate-500">
                目前沒有任務紀錄。
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
