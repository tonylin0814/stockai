import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DecisionRow = {
  id: string;
  daily_run_id: string | null;
  decision_action: string | null;
  confidence: number | null;
  market_summary: string | null;
  portfolio_actions: unknown;
  created_at: string;
};

type TeamReportRow = {
  id: string;
  division: string;
  team_name: string;
  portfolio_review: unknown;
  final_team_view: unknown;
  confidence: number | null;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function labelForKey(key: string) {
  const labels: Record<string, string> = {
    symbol: "代號",
    name: "名稱",
    action: "建議",
    shares: "股數",
    average_cost: "平均成本",
    current_price: "現價",
    market_value: "市值",
    unrealized_pnl: "未實現損益",
    return_pct: "報酬率",
    change_pct: "漲跌幅",
    stop_loss: "停損",
    target_price: "目標價",
    buy_zone_low: "買入區間低",
    buy_zone_high: "買入區間高",
    sell_zone_low: "賣出區間低",
    sell_zone_high: "賣出區間高",
    data_time: "資料時間",
    data_source: "資料來源",
    data_quality: "資料品質",
    reason: "理由",
    risk: "風險",
    view: "觀點",
    technical: "技術分析",
    macro: "總經分析",
    catalysts: "催化因素"
  };
  return labels[key] ?? key;
}

function DetailGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {entries.map(([key, value]) => {
        const text = displayValue(value);
        const isLong = text.length > 90 || text.includes("\n") || text.startsWith("{") || text.startsWith("[");

        return (
          <div
            key={key}
            className={isLong ? "md:col-span-2" : undefined}
          >
            <div className="text-xs font-medium text-slate-500">{labelForKey(key)}</div>
            <div className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800">
              {text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function PortfolioAnalysisDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { symbol?: string };
}) {
  const authClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) notFound();

  const symbol = normalizeSymbol(searchParams?.symbol);
  const supabase = createSupabaseServiceClient();
  const { data: decisionData, error } = await supabase
    .from("stocks_division_decisions")
    .select("id, daily_run_id, decision_action, confidence, market_summary, portfolio_actions, created_at")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !decisionData) notFound();

  const decision = decisionData as unknown as DecisionRow;
  const actions = Array.isArray(decision.portfolio_actions)
    ? decision.portfolio_actions.map((item) => asRecord(item))
    : [];
  const action = actions.find((item) => normalizeSymbol(item.symbol) === symbol) ?? actions[0] ?? {};
  const actionSymbol = normalizeSymbol(action.symbol) || symbol;

  const { data: teamData, error: teamError } = decision.daily_run_id
    ? await supabase
        .from("stocks_team_reports")
        .select("id, division, team_name, portfolio_review, final_team_view, confidence, created_at")
        .eq("user_id", user.id)
        .eq("daily_run_id", decision.daily_run_id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (teamError) {
    throw new Error(teamError.message);
  }

  const teamReports = ((teamData ?? []) as unknown as TeamReportRow[])
    .map((report) => {
      const reviewItems = Array.isArray(report.portfolio_review)
        ? report.portfolio_review.map((item) => asRecord(item))
        : [];
      const matchedReview = reviewItems.find((item) => normalizeSymbol(item.symbol) === actionSymbol);

      return {
        ...report,
        matchedReview
      };
    })
    .filter((report) => report.matchedReview);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/portfolio/analysis">
            <Button type="button" variant="secondary" size="icon" aria-label="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700">
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-semibold text-slate-950">
                {actionSymbol || "持股"} 投資分析
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              分析時間：{formatDateTime(decision.created_at)}
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">委員決策</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-500">建議</div>
            <div className="mt-1 font-semibold text-slate-950">{displayValue(decision.decision_action)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">信心</div>
            <div className="mt-1 font-semibold text-slate-950">{displayValue(decision.confidence)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">分析 ID</div>
            <div className="mt-1 text-sm text-slate-600">{decision.id}</div>
          </div>
        </div>
        {decision.market_summary ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {decision.market_summary}
          </p>
        ) : null}
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">持股分析內容</h2>
        <div className="mt-4">
          <DetailGrid data={action} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-950">團隊分析內容</h2>
        {teamReports.length ? (
          teamReports.map((report) => (
            <article key={report.id} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{report.team_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{report.division}</p>
                </div>
                <div className="text-sm text-slate-500">信心 {displayValue(report.confidence)}</div>
              </div>
              <DetailGrid data={report.matchedReview ?? {}} />
            </article>
          ))
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            這筆分析沒有找到對應的團隊明細。
          </div>
        )}
      </section>
    </div>
  );
}
