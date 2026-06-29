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
  started_at: string | null;
  created_at: string;
  profiles: { email?: string | null } | null;
};

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
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
    .replace(/\//g, "-");
}

function shortUser(email: string | null | undefined, fallback: string) {
  return email?.split("@")[0] || fallback.split("@")[0] || "—";
}

function isSameDay(value: string, today: Date) {
  const date = new Date(value);
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isSameMonth(value: string, today: Date) {
  const date = new Date(value);
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
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

export default async function ApiUsagePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  let rows: AgentRunRow[] = [];

  try {
    const { data, error } = await supabase
      .from("agent_runs")
      .select("id, model_provider, model_name, prompt_tokens, completion_tokens, token_count, estimated_cost_usd, status, started_at, created_at, profiles(email)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!error) {
      rows = (data ?? []) as unknown as AgentRunRow[];
    }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">API 用量</h1>
        <p className="mt-1 text-sm text-slate-600">追蹤分析任務的 token 與費用估算。</p>
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

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">尚無 API 使用記錄。</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>日期時間</Th>
              <Th>使用者</Th>
              <Th>供應商</Th>
              <Th>模型</Th>
              <Th>輸入 Tokens</Th>
              <Th>輸出 Tokens</Th>
              <Th>總 Tokens</Th>
              <Th>費用 (USD)</Th>
              <Th>狀態</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{formatDateTime(row.created_at)}</Td>
                <Td>{shortUser(row.profiles?.email, user.email ?? "")}</Td>
                <Td>{row.model_provider ?? "—"}</Td>
                <Td>{row.model_name ?? "—"}</Td>
                <Td>{row.prompt_tokens ?? "—"}</Td>
                <Td>{row.completion_tokens ?? "—"}</Td>
                <Td>{row.token_count ?? "—"}</Td>
                <Td>{formatCost(row.estimated_cost_usd)}</Td>
                <Td>
                  <StatusCell status={row.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
