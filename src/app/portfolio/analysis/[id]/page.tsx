import Link from "next/link";
import Image from "next/image";
import { BriefcaseBusiness } from "lucide-react";
import { notFound } from "next/navigation";
import { TeamReportTabs } from "@/components/team-report-tabs";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DecisionRow = {
  id: string;
  daily_run_id: string | null;
  decision_action: string | null;
  division: string | null;
  division_manager: string | null;
  model_provider: string | null;
  confidence: number | null;
  market_summary: string | null;
  portfolio_actions: unknown;
  created_at: string;
};

type TeamReportRow = {
  id: string;
  division: string;
  team_name: string;
  market_view: Record<string, unknown> | null;
  portfolio_review: unknown;
  final_team_view: Record<string, unknown> | null;
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

function advisorProfile(value: unknown) {
  const text = String(value ?? "");

  if (text.includes("Claire") || text.includes("Anthropic") || text.includes("Claude")) {
    return { name: "Claire", image: "/advisors/claire.png" };
  }

  return { name: "Monica", image: "/advisors/monica.png" };
}

function advisorTitle(advisor: { name: string }) {
  return advisor.name === "Claire" ? "Claire 經理 - Claude" : "Monica 經理 - GPT";
}

function modelLabel(decision: DecisionRow) {
  const provider = String(decision.model_provider ?? decision.division ?? "");
  if (provider.includes("Anthropic") || provider.includes("Claude")) return "Claude";
  if (provider.includes("OpenAI") || provider.includes("GPT")) return "GPT";
  return String(decision.division ?? "模型");
}

const committeeAdvisor = { name: "Kevin", image: "/advisors/kevin.png" };

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

function actionForSymbol(decision: DecisionRow, symbol: string) {
  const actions = Array.isArray(decision.portfolio_actions)
    ? decision.portfolio_actions.map((item) => asRecord(item))
    : [];
  return actions.find((item) => normalizeSymbol(item.symbol) === symbol) ?? actions[0] ?? {};
}

function actionTextFor(decision: DecisionRow, action: Record<string, unknown>) {
  return textFor(action, ["action"]) || displayValue(decision.decision_action);
}

function consensusText(items: Array<{ decision: DecisionRow; action: Record<string, unknown> }>) {
  if (!items.length) return "模型共識：-";
  const labels = items.map((item) => actionTextFor(item.decision, item.action));
  const same = labels.every((label) => label === labels[0]);
  if (same) return `模型共識：${labels[0]}`;
  return `模型分歧：${items.map((item) => `${modelLabel(item.decision)} ${actionTextFor(item.decision, item.action)}`).join("，")}`;
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
  let { data: decisionData, error } = await supabase
    .from("stocks_division_decisions")
    .select("id, daily_run_id, division, division_manager, model_provider, decision_action, confidence, market_summary, portfolio_actions, created_at")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) notFound();

  if (!decisionData) {
    const runResult = await supabase
      .from("stocks_division_decisions")
      .select("id, daily_run_id, division, division_manager, model_provider, decision_action, confidence, market_summary, portfolio_actions, created_at")
      .eq("daily_run_id", params.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runResult.error || !runResult.data) notFound();
    decisionData = runResult.data;
  }

  const decision = decisionData as unknown as DecisionRow;
  const allDecisionResult = decision.daily_run_id
    ? await supabase
        .from("stocks_division_decisions")
        .select("id, daily_run_id, division, division_manager, model_provider, decision_action, confidence, market_summary, portfolio_actions, created_at")
        .eq("user_id", user.id)
        .eq("daily_run_id", decision.daily_run_id)
        .order("created_at", { ascending: true })
    : { data: [decisionData], error: null };

  if (allDecisionResult.error) {
    throw new Error(allDecisionResult.error.message);
  }

  const allDecisions = (allDecisionResult.data ?? []) as unknown as DecisionRow[];
  const actions = Array.isArray(decision.portfolio_actions)
    ? decision.portfolio_actions.map((item) => asRecord(item))
    : [];
  const action = actions.find((item) => normalizeSymbol(item.symbol) === symbol) ?? actions[0] ?? {};
  const actionSymbol = normalizeSymbol(action.symbol) || symbol;
  const decisionAnalyses = allDecisions
    .map((item) => ({
      decision: item,
      action: actionForSymbol(item, actionSymbol)
    }))
    .filter((item) => Object.keys(item.action).length);
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
        .select("id, division, team_name, market_view, portfolio_review, final_team_view, confidence, created_at")
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
  const teamTabsReports = teamReports.map((report) => ({
    id: report.id,
    division: report.division,
    team_name: report.team_name,
    market_view: report.market_view,
    portfolio_review: report.matchedReview ? [report.matchedReview] : [],
    final_team_view: report.final_team_view
  }));
  const consensus = consensusText(decisionAnalyses);
  const confidenceValues = decisionAnalyses
    .map((item) => Number(item.decision.confidence))
    .filter((value) => Number.isFinite(value));
  const confidenceText = confidenceValues.length
    ? `信心區間：${Math.min(...confidenceValues)} - ${Math.max(...confidenceValues)}`
    : "信心區間：-";

  return (
    <div className="space-y-8">
      <Link
        href="/portfolio/analysis"
        className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
      >
        返回我的投資分析
      </Link>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700">
            <BriefcaseBusiness className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold text-slate-950">
            {actionSymbol || "持股"} 投資分析
          </h1>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>原始問題：Portfolio 自動分析 {actionSymbol} {actionName}</p>
          <p>任務類型：投資組合檢視</p>
          <p>相關代號：{actionSymbol || "-"}</p>
          <p>建立時間：{formatDateTime(decision.created_at)}</p>
          <p>完成時間：{formatDateTime(decision.created_at)}</p>
          <div className="flex items-center gap-2">
            <span>狀態：</span>
            <span className="rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
              完成
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">委員會決策</h2>
          <p className="mt-1 text-sm text-slate-500">
            {consensus} | {confidenceText}
          </p>
        </div>
        <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image
                src={committeeAdvisor.image}
                alt={committeeAdvisor.name}
                width={56}
                height={56}
                className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
              />
              <div>
                <h3 className="text-base font-semibold text-slate-950">Kevin 委員 - Codex</h3>
                <p className="mt-1 text-xs text-slate-500">
                  決策時間：{formatDateTime(decision.created_at)}
                </p>
              </div>
            </div>
            <span className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-800">
              completed
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">建議</p>
              <p className="font-medium text-slate-950">{actionText}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">信心</p>
              <p className="font-medium text-slate-950">{confidenceText.replace("信心區間：", "")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">允許行動</p>
              <p className="font-medium text-slate-950">是</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">最終動作</p>
              <p className="font-medium text-slate-950">{actionText}</p>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {decision.market_summary || textFor(action, ["reason", "view", "technical", "macro", "risk"]) || "-"}
          </p>
        </article>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">模型分析對照</h2>
          <div className="mt-2 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            <p>{consensus}</p>
            <p className="mt-1">
              價格區間：買入 {[shortValue(action.buy_zone_low), shortValue(action.buy_zone_high)].filter((value) => value && value !== "-").join(" - ") || "—"}；
              目標 {shortValue(action.target_price)}；停損 {shortValue(action.stop_loss)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {decisionAnalyses.map(({ decision: itemDecision, action: itemAction }) => {
            const advisor = advisorProfile(itemDecision.division_manager ?? itemDecision.model_provider ?? itemDecision.division);
            const itemActionText = actionTextFor(itemDecision, itemAction);
            const itemReturnPct = itemAction.return_pct;
            const itemChangePct = itemAction.change_pct;
            const itemReturnTone =
              typeof itemReturnPct === "number" && itemReturnPct < 0 ? "bad" : typeof itemReturnPct === "number" && itemReturnPct > 0 ? "good" : "neutral";
            const itemChangeTone =
              typeof itemChangePct === "number" && itemChangePct < 0 ? "bad" : typeof itemChangePct === "number" && itemChangePct > 0 ? "good" : "neutral";

            return (
              <article key={itemDecision.id} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src={advisor.image}
                      alt={advisor.name}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
                    />
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">{advisorTitle(advisor)}</h3>
                      <p className="mt-1 text-xs text-slate-500">{modelLabel(itemDecision)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        分析時間：{formatDateTime(itemDecision.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">{itemActionText}</p>
                    <p className="text-xs text-slate-500">信心 {displayValue(itemDecision.confidence)}</p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-700">
                  {itemDecision.market_summary || textFor(itemAction, ["summary", "view", "reason"]) || "-"}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">買進區間</p>
                    <p className="mt-1 font-medium text-slate-950">
                      {[shortValue(itemAction.buy_zone_low), shortValue(itemAction.buy_zone_high)].filter((value) => value && value !== "-").join(" - ") || "-"}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">目標價</p>
                    <p className="mt-1 font-medium text-slate-950">{shortValue(itemAction.target_price)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">停損</p>
                    <p className="mt-1 font-medium text-slate-950">{shortValue(itemAction.stop_loss)}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">核心理由</p>
                    <div className="mt-1 text-sm leading-6 text-slate-700">
                      <ReportParagraphs data={itemAction} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <MetricCard label="現價" value={shortValue(itemAction.current_price)} />
                    <MetricCard label="平均成本" value={shortValue(itemAction.average_cost)} />
                    <MetricCard label="報酬率" value={formatPercent(itemReturnPct)} tone={itemReturnTone} />
                    <MetricCard label="今日漲跌幅" value={formatPercent(itemChangePct)} tone={itemChangeTone} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Team Reports</h2>
        {teamTabsReports.length ? (
          <TeamReportTabs reports={teamTabsReports} />
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            這筆分析沒有找到對應的團隊明細。
          </div>
        )}
      </section>
    </div>
  );
}
