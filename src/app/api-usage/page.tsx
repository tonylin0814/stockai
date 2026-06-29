import Link from "next/link";
import { Table, Td, Th } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AgentRunRow = {
  id: string;
  model_provider: string | null;
  model_name: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  token_count: number | null;
  estimated_cost_usd: number | null;
  status: string | null;
  error_message: string | null;
  mission_id: string | null;
  daily_run_id: string | null;
  started_at: string | null;
  created_at: string;
};

type PageProps = {
  searchParams?: { filter?: string };
};

const TORONTO_TIME_ZONE = "America/Toronto";

function formatUsd(value: number) {
  return `US$${value.toFixed(4)}`;
}

function formatCost(value: number | null) {
  return value != null ? `US$${Number(value).toFixed(6)}` : "—";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date
    .toLocaleString("zh-TW", {
      timeZone: TORONTO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
    .replace(/\//g, "-");
}

function torontoDateParts(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
    day: parts.find((part) => part.type === "day")?.value ?? ""
  };
}

function isSameDay(value: string, today: Date) {
  const row = torontoDateParts(value);
  const current = torontoDateParts(today);
  return row.year === current.year && row.month === current.month && row.day === current.day;
}

function isSameMonth(value: string, today: Date) {
  const row = torontoDateParts(value);
  const current = torontoDateParts(today);
  return row.year === current.year && row.month === current.month;
}

function runContext(row: AgentRunRow) {
  if (row.mission_id) return `任務 ${row.mission_id.slice(0, 8)}`;
  if (row.daily_run_id) return `每日 ${row.daily_run_id.slice(0, 8)}`;
  return "—";
}

function StatusCell({ status }: { status: string | null }) {
  const completed = status === "completed";
  const failed = status === "failed";

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${
          completed ? "bg-green-600" : failed ? "bg-red-600" : "bg-slate-400"
        }`}
      />
      {completed ? "完成" : failed ? "失敗" : status ?? "—"}
    </span>
  );
}

export default async function ApiUsagePage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  if (!user) return null;

  let rows: AgentRunRow[] = [];

  try {
    const { data, error } = await supabase
      .from("agent_runs")
      .select("id, model_provider, model_name, prompt_tokens, completion_tokens, token_count, estimated_cost_usd, status, error_message, mission_id, daily_run_id, started_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!error) rows = (data ?? []) as unknown as AgentRunRow[];
  } catch {
    rows = [];
  }

  const today = new Date();
  const todayCost = rows
    .filter((row) => isSameDay(row.created_at, today))
    .reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0);
  const monthCost = rows
    .filter((row) => isSameMonth(row.created_at, today))
    .reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0);
  const totalCost = rows.reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0);
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const showFailedOnly = searchParams?.filter === "failed";
  const visibleRows = showFailedOnly ? rows.filter((row) => row.status === "failed") : rows;
  const userLabel = user.email?.split("@")[0] ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">API 用量</h1>
        <p className="mt-1 text-sm text-slate-600">追蹤分析任務的 token、費用與錯誤訊息。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">今日費用</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{formatUsd(todayCost)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">本月費用</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{formatUsd(monthCost)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">累計費用</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{formatUsd(totalCost)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">累計執行</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{rows.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          失敗：{failedCount} 筆　｜　總費用：{formatUsd(totalCost)}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/api-usage"
            className={`rounded-md border px-3 py-1.5 text-sm ${
              showFailedOnly
                ? "border-slate-200 bg-white text-slate-700"
                : "border-slate-900 bg-slate-900 text-white"
            }`}
          >
            全部
          </Link>
          <Link
            href="/api-usage?filter=failed"
            className={`rounded-md border px-3 py-1.5 text-sm ${
              showFailedOnly
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            僅失敗
          </Link>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <p className="text-sm text-slate-500">尚無 API 使用記錄。</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>日期時間</Th>
              <Th>使用者</Th>
              <Th>任務/執行</Th>
              <Th>供應商</Th>
              <Th>模型</Th>
              <Th>輸入 Tokens</Th>
              <Th>輸出 Tokens</Th>
              <Th>總 Tokens</Th>
              <Th>費用 (USD)</Th>
              <Th>狀態</Th>
              <Th>錯誤訊息</Th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <Td>{formatDateTime(row.created_at)}</Td>
                <Td>{userLabel}</Td>
                <Td>
                  <span className="text-xs text-slate-500">{runContext(row)}</span>
                </Td>
                <Td>{row.model_provider ?? "—"}</Td>
                <Td>{row.model_name ?? "—"}</Td>
                <Td>{row.prompt_tokens ?? "—"}</Td>
                <Td>{row.completion_tokens ?? "—"}</Td>
                <Td>{row.token_count ?? "—"}</Td>
                <Td>{formatCost(row.estimated_cost_usd)}</Td>
                <Td>
                  <StatusCell status={row.status} />
                </Td>
                <Td className="max-w-md">
                  {row.status === "failed" && row.error_message ? (
                    <span className="break-words text-xs text-red-600">
                      {row.error_message.slice(0, 120)}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
