import Link from "next/link";
import type React from "react";
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

function shortValue(value: unknown) {
  const text = displayValue(value);
  return text === "unknown" || text === "insufficient_data" ? "資料不足" : text;
}

function textFor(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return shortValue(value);
  }
  return "";
}

function formatPercent(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value.toFixed(2)}%`;
  const text = shortValue(value);
  return text && text !== "-" ? text : "-";
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

function MetricCard({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "text-slate-950";

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-base font-semibold ${toneClass}`}>{value || "-"}</div>
    </div>
  );
}

function NarrativeSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-3 text-sm leading-7 text-slate-700">{children}</div>
    </section>
  );
}

function ReportParagraphs({ data }: { data: Record<string, unknown> }) {
  const preferredKeys = [
    "reason",
    "view",
    "technical",
    "macro",
    "catalysts",
    "risk",
    "summary",
    "rationale",
    "comment",
    "notes"
  ];
  const used = new Set(["symbol", "name", "action", "shares", "average_cost", "current_price", "market_value", "unrealized_pnl", "return_pct", "change_pct", "stop_loss", "target_price", "buy_zone_low", "buy_zone_high", "sell_zone_low", "sell_zone_high", "data_time", "data_source", "data_quality"]);
  const textEntries = preferredKeys
    .filter((key) => data[key] !== null && data[key] !== undefined && data[key] !== "")
    .map((key) => [key, data[key]] as const);
  const otherEntries = Object.entries(data).filter(([key, value]) => {
    if (used.has(key) || preferredKeys.includes(key)) return false;
    if (value === null || value === undefined || value === "") return false;
    return typeof value === "string";
  });
  const entries = [...textEntries, ...otherEntries];

  if (!entries.length) {
    return <p>這筆分析沒有留下文字說明。</p>;
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, value]) => (
        <div key={key}>
          <h3 className="text-sm font-semibold text-slate-900">{labelForKey(key)}</h3>
          <p className="mt-1 whitespace-pre-wrap">{shortValue(value)}</p>
        </div>
      ))}
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
  const actionName = textFor(action, ["name"]);
  const actionText = textFor(action, ["action"]) || displayValue(decision.decision_action);
  const returnPct = action.return_pct;
  const changePct = action.change_pct;
  const returnTone =
    typeof returnPct === "number" && returnPct < 0 ? "bad" : typeof returnPct === "number" && returnPct > 0 ? "good" : "neutral";
  const changeTone =
    typeof changePct === "number" && changePct < 0 ? "bad" : typeof changePct === "number" && changePct > 0 ? "good" : "neutral";

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">投資結論</h2>
            <p className="mt-1 text-sm text-slate-500">
              {actionSymbol} {actionName ? `/ ${actionName}` : ""}
            </p>
          </div>
          <span className="rounded-md border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
            {actionText}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricCard label="現價" value={shortValue(action.current_price)} />
          <MetricCard label="平均成本" value={shortValue(action.average_cost)} />
          <MetricCard label="報酬率" value={formatPercent(returnPct)} tone={returnTone} />
          <MetricCard label="今日漲跌幅" value={formatPercent(changePct)} tone={changeTone} />
        </div>
        {decision.market_summary ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {decision.market_summary}
          </p>
        ) : null}
      </section>

      <NarrativeSection title="價格區間與風險控管">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricCard
            label="買入區間"
            value={[shortValue(action.buy_zone_low), shortValue(action.buy_zone_high)].filter((value) => value && value !== "-").join(" - ") || "-"}
          />
          <MetricCard
            label="賣出區間"
            value={[shortValue(action.sell_zone_low), shortValue(action.sell_zone_high)].filter((value) => value && value !== "-").join(" - ") || "-"}
          />
          <MetricCard label="目標價" value={shortValue(action.target_price)} />
          <MetricCard label="停損" value={shortValue(action.stop_loss)} tone="bad" />
        </div>
      </NarrativeSection>

      <NarrativeSection title="分析說明">
        <ReportParagraphs data={action} />
      </NarrativeSection>

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
              <ReportParagraphs data={report.matchedReview ?? {}} />
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
