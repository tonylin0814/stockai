import Link from "next/link";
import { XCircle } from "lucide-react";
import { cancelMission } from "@/app/actions";
import { MissionDialog } from "@/components/mission-dialog";
import { Button } from "@/components/ui/button";
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

export default async function MissionsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: missions } = await supabase
    .from("missions")
    .select("id, title, mission_type, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">任務中心</h1>
          <p className="mt-1 text-sm text-slate-600">建立並追蹤指定投資分析任務。</p>
        </div>
        <MissionDialog />
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
          {(missions ?? []).map((mission) => (
            <tr key={mission.id}>
              <Td>{mission.title}</Td>
              <Td>{mission.mission_type}</Td>
              <Td>
                <span className={cn("rounded-md border px-2 py-1 text-xs font-medium", statusClass(mission.status))}>
                  {statusLabel(mission.status)}
                </span>
              </Td>
              <Td>{formatDateTime(mission.created_at)}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/missions/${mission.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  >
                    查看
                  </Link>
                  {mission.status === "pending" ? (
                    <form action={cancelMission}>
                      <input type="hidden" name="id" value={mission.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        <XCircle className="h-4 w-4" />
                        取消
                      </Button>
                    </form>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
