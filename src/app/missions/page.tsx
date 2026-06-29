import Link from "next/link";
import { Plus, XCircle } from "lucide-react";
import { cancelMission, createMission } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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

function MissionForm() {
  return (
    <form action={createMission} className="grid gap-4 md:grid-cols-2">
      <FormField label="任務標題" htmlFor="title">
        <Input id="title" name="title" required />
      </FormField>
      <FormField label="任務類型" htmlFor="mission_type">
        <Select id="mission_type" name="mission_type" required defaultValue="single_stock">
          <option value="single_stock">single_stock</option>
          <option value="multi_stock">multi_stock</option>
          <option value="portfolio_review">portfolio_review</option>
          <option value="watchlist_review">watchlist_review</option>
          <option value="theme">theme</option>
          <option value="event">event</option>
        </Select>
      </FormField>
      <div className="md:col-span-2">
        <FormField label="原始問題" htmlFor="original_question">
          <Textarea id="original_question" name="original_question" required />
        </FormField>
      </div>
      <FormField label="相關股票代號" htmlFor="related_symbols">
        <Input id="related_symbols" name="related_symbols" placeholder="NVDA, TSMC, 2330" />
      </FormField>
      <FormField label="相關市場" htmlFor="related_market">
        <Select id="related_market" name="related_market" defaultValue="">
          <option value="">未指定</option>
          <option value="US">US</option>
          <option value="TW">TW</option>
          <option value="both">both</option>
        </Select>
      </FormField>
      <div className="flex justify-end md:col-span-2">
        <Button type="submit">建立任務</Button>
      </div>
    </form>
  );
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
        <Dialog
          title="新增任務"
          trigger={
            <Button type="button">
              <Plus className="h-4 w-4" />
              新增任務
            </Button>
          }
        >
          <MissionForm />
        </Dialog>
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
                  {mission.status}
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
