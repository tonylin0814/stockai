import Link from "next/link";
import { addMarketPickToWatchlist } from "@/app/actions";
import {
  AnalysisRunReportDialog,
  type AnalysisAgentLogItem,
  type AnalysisReportItem
} from "@/components/analysis-run-report-dialog";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { AnalysisProgressRunner } from "@/components/analysis-progress-runner";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime, formatNumber, formatSignedNumber, formatSignedPercent } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Market = "TW" | "US";

type ScanPick = {
  symbol: string;
  name: string;
  market: Market;
  signal: "bull" | "bear" | "neutral";
  currentPrice: number;
  entryPoint: number;
  targetPrice: number;
  stopLoss: number;
  upsidePct: number;
  confidence: number;
  reason: string;
  volumeAlert: boolean;
};

type MarketAnalysisRow = {
  id: string;
  market: Market;
  sentiment: string | null;
  sentiment_reason: string | null;
  picks_under_50: unknown;
  picks_under_100: unknown;
  picks_under_200: unknown;
  etf_picks: unknown;
  created_at?: string | null;
};

type QuoteSnapshot = {
  price?: number;
  change?: number;
  changePct?: number;
  sourceUpdatedAt?: string;
};

type DataPackageSummary = {
  packageDate?: string;
  portfolioCount?: number;
  watchlistCount?: number;
  marketSnapshot?: {
    taiex?: QuoteSnapshot;
    sp500?: QuoteSnapshot;
    nasdaq?: QuoteSnapshot;
    vix?: QuoteSnapshot;
    usdTwd?: number;
  };
  upcomingEarnings?: Array<{
    symbol?: string;
    name?: string;
    date?: string;
    daysUntil?: number;
  }>;
  webResearch?: unknown;
};

type AnalysisProgress = {
  expectedTeamReports: number;
  expectedDivisionDecisions: number;
  teamReports: number;
  divisionDecisions: number;
  committeeDecisions: number;
  recommendations: number;
  scanPicks: number;
  marketAnalyses: number;
  completedAgents: number;
  failedAgents: number;
  latestError: string | null;
};

type AgentRunSummary = {
  prompt_key: string | null;
  model_provider: string | null;
  model_name: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asDataPackage(value: unknown): DataPackageSummary {
  return asRecord(value) as DataPackageSummary;
}

function effectiveDataPackage(value: unknown): DataPackageSummary {
  const record = asRecord(value);
  return asDataPackage(record.dataPackage ?? value);
}

function pipelineStage(value: unknown) {
  const record = asRecord(value);
  return typeof record.pipelineStage === "string" ? record.pipelineStage : null;
}

function stageMessage(value: unknown) {
  const record = asRecord(value);
  return typeof record.stageMessage === "string" ? record.stageMessage : null;
}

function stageError(value: unknown) {
  const record = asRecord(value);
  return typeof record.error === "string" ? record.error : null;
}

function statusLabel(status: unknown) {
  if (status === "completed") return "完成";
  if (status === "running") return "執行中";
  if (status === "failed") return "失敗";
  return "尚未執行";
}

function statusClass(status: unknown) {
  if (status === "completed") return "border-green-200 bg-green-50 text-green-900";
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-900";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-white text-slate-900";
}

const STAGE_ORDER = [
  "data_package",
  "division",
  "committee",
  "recommendations",
  "tw_scan",
  "market_tw",
  "market_us",
  "complete"
];

function stageHasPassed(currentStage: string | null, targetStage: string) {
  if (!currentStage) return false;
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const targetIndex = STAGE_ORDER.indexOf(targetStage);
  return currentIndex >= 0 && targetIndex >= 0 && currentIndex > targetIndex;
}

function reportStatus(params: {
  runStatus: unknown;
  count: number;
  expected?: number;
  runningStage?: string;
  currentStage: string | null;
  completedByStage?: string;
}): AnalysisReportItem["status"] {
  if (params.runStatus === "failed" && params.count === 0) return "failed";
  if (params.expected !== undefined && params.expected > 0 && params.count >= params.expected) {
    return "completed";
  }
  if (params.count > 0 && params.expected === undefined) return "completed";
  if (params.completedByStage && stageHasPassed(params.currentStage, params.completedByStage)) {
    return "completed";
  }
  if (params.runStatus === "running" && params.currentStage === params.runningStage) return "running";
  return "pending";
}

function asPickArray(value: unknown): ScanPick[] {
  return Array.isArray(value) ? (value as ScanPick[]) : [];
}

function sentimentLabel(sentiment: string | null | undefined) {
  if (sentiment === "bull") return "市場偏多";
  if (sentiment === "bear") return "市場偏空";
  return "市場中性";
}

function sentimentClass(sentiment: string | null | undefined) {
  if (sentiment === "bull") return "bg-green-100 text-green-800";
  if (sentiment === "bear") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function signalLabel(signal: string) {
  if (signal === "bull") return "做多";
  if (signal === "bear") return "偏空";
  return "觀察";
}

function signalClass(signal: string) {
  if (signal === "bull") return "bg-green-100 text-green-800";
  if (signal === "bear") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function IndexMiniCard({
  title,
  value,
  change,
  changePct
}: {
  title: string;
  value: string;
  change?: number | null;
  changePct?: number | null;
}) {
  const changeClass =
    change === null || change === undefined || change === 0
      ? "text-slate-500"
      : change > 0
        ? "text-green-700"
        : "text-red-700";

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
      {change !== undefined || changePct !== undefined ? (
        <div className={`mt-1 text-xs ${changeClass}`}>
          {change !== null && change !== undefined ? formatSignedNumber(change, 2) : "—"}{" "}
          {changePct !== null && changePct !== undefined ? formatSignedPercent(changePct) : ""}
        </div>
      ) : null}
    </div>
  );
}

function PickCard({ pick }: { pick: ScanPick }) {
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-950">{pick.symbol}</div>
          <div className="text-xs text-slate-500">{pick.name}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${signalClass(pick.signal)}`}>
          {signalLabel(pick.signal)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-slate-50 p-2">
          <div className="text-slate-500">現價</div>
          <div className="font-semibold text-slate-950">{formatNumber(pick.currentPrice, 2)}</div>
        </div>
        <div className="rounded-md bg-blue-50 p-2">
          <div className="text-slate-500">進場點</div>
          <div className="font-semibold text-blue-800">{formatNumber(pick.entryPoint, 2)}</div>
        </div>
        <div className="rounded-md bg-green-50 p-2">
          <div className="text-slate-500">目標價</div>
          <div className="font-semibold text-green-800">{formatNumber(pick.targetPrice, 2)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-red-600">停損 {formatNumber(pick.stopLoss, 2)}</span>
        <span className={pick.upsidePct >= 0 ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
          {pick.upsidePct >= 0 ? "+" : ""}
          {formatNumber(pick.upsidePct, 1)}% 空間
        </span>
        <span className="text-slate-500">信心 {pick.confidence}%</span>
      </div>

      {pick.volumeAlert ? (
        <div className="rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800">
          今日量能放大
        </div>
      ) : null}

      <p className="border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-600">
        {pick.reason}
      </p>

      <form action={addMarketPickToWatchlist}>
        <input type="hidden" name="symbol" value={pick.symbol} />
        <input type="hidden" name="market" value={pick.market} />
        <input type="hidden" name="name" value={pick.name} />
        <input type="hidden" name="targetPrice" value={String(pick.targetPrice)} />
        <input type="hidden" name="reason" value={pick.reason} />
        <PendingSubmitButton
          idleLabel="加入關注清單"
          pendingLabel="加入中..."
          variant="secondary"
          size="sm"
          className="w-full text-xs"
        />
      </form>
    </div>
  );
}

function EmptyAnalysis() {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
      尚未產生此區間推薦。請執行市場分析取得最新結果。
    </div>
  );
}

function PickSection({ title, picks }: { title: string; picks: ScanPick[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {picks.length === 0 ? (
        <EmptyAnalysis />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {picks.map((pick) => (
            <PickCard key={`${pick.market}-${pick.symbol}`} pick={pick} />
          ))}
        </div>
      )}
    </section>
  );
}

function buildUpcomingEvents(market: Market, dataPackage: DataPackageSummary) {
  const earnings = (dataPackage.upcomingEarnings ?? [])
    .filter((event) => (market === "US" ? !/^\d/.test(event.symbol ?? "") : /^\d/.test(event.symbol ?? "")))
    .slice(0, 3)
    .map((event) => ({
      title: `${event.symbol ?? ""} 財報`,
      detail: event.name ?? "",
      date: event.date ?? ""
    }));
  const recurring =
    market === "TW"
      ? [
          { title: "台灣出口數據", detail: "月度公布", date: "每月" },
          { title: "央行理監事會議", detail: "季度會議", date: "季度" }
        ]
      : [
          { title: "FOMC 會議", detail: "利率決策", date: "每6週" },
          { title: "CPI 通膨數據", detail: "月度公布", date: "每月" },
          { title: "非農就業報告", detail: "每月第一個週五", date: "每月" }
        ];

  return [...earnings, ...recurring].slice(0, 5);
}

export default async function DailyAnalysisPage({
  searchParams
}: {
  searchParams: { market?: string; updated?: string; report?: string };
}) {
  const activeMarket: Market = searchParams.market === "US" ? "US" : "TW";
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const today = todayIsoDate();
  const { data: run } = await supabase
    .from("daily_runs")
    .select("id, status, run_date, data_package, created_at")
    .eq("user_id", user.id)
    .eq("run_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const runRecord = (run ?? null) as Record<string, unknown> | null;
  const dataPackage = effectiveDataPackage(runRecord?.data_package);
  const snapshot = dataPackage.marketSnapshot ?? {};
  const runId = typeof runRecord?.id === "string" ? runRecord.id : null;
  const currentStage = pipelineStage(runRecord?.data_package);
  let progress: AnalysisProgress = {
    expectedTeamReports: 0,
    expectedDivisionDecisions: 0,
    teamReports: 0,
    divisionDecisions: 0,
    committeeDecisions: 0,
    recommendations: 0,
    scanPicks: 0,
    marketAnalyses: 0,
    completedAgents: 0,
    failedAgents: 0,
    latestError: null
  };
  let agentLogs: AnalysisAgentLogItem[] = [];

  if (runId) {
    const [
      enabledDivisionCount,
      enabledTeamCount,
      teamCount,
      divisionCount,
      committeeCount,
      recommendationCount,
      scanPickCount,
      marketAnalysisCount,
      completedAgentCount,
      failedAgentCount,
      latestFailedAgent,
      latestAgentRuns
    ] = await Promise.all([
      supabase
        .from("divisions")
        .select("id", { count: "exact", head: true })
        .eq("is_enabled", true)
        .eq("participates_in_committee", true),
      supabase
        .from("division_teams")
        .select("id", { count: "exact", head: true })
        .eq("is_enabled", true),
      supabase
        .from("team_reports")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId),
      supabase
        .from("division_decisions")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId),
      supabase
        .from("committee_decisions")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId),
      supabase
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId),
      supabase
        .from("daily_scan_picks")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId),
      supabase
        .from("market_analysis_runs")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId),
      supabase
        .from("agent_runs")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId)
        .eq("status", "completed"),
      supabase
        .from("agent_runs")
        .select("id", { count: "exact", head: true })
        .eq("daily_run_id", runId)
        .eq("status", "failed"),
      supabase
        .from("agent_runs")
        .select("prompt_key, error_message")
        .eq("daily_run_id", runId)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("agent_runs")
        .select("prompt_key, model_provider, model_name, status, error_message, created_at")
        .eq("daily_run_id", runId)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);
    const latestErrorRow = latestFailedAgent.data as
      | { prompt_key?: string | null; error_message?: string | null }
      | null;
    progress = {
      expectedTeamReports: enabledTeamCount.count ?? 0,
      expectedDivisionDecisions: enabledDivisionCount.count ?? 0,
      teamReports: teamCount.count ?? 0,
      divisionDecisions: divisionCount.count ?? 0,
      committeeDecisions: committeeCount.count ?? 0,
      recommendations: recommendationCount.count ?? 0,
      scanPicks: scanPickCount.count ?? 0,
      marketAnalyses: marketAnalysisCount.count ?? 0,
      completedAgents: completedAgentCount.count ?? 0,
      failedAgents: failedAgentCount.count ?? 0,
      latestError: latestErrorRow?.error_message
        ? `${latestErrorRow.prompt_key ?? "agent"}：${latestErrorRow.error_message}`
        : null
    };
    agentLogs = ((latestAgentRuns.data ?? []) as AgentRunSummary[]).map((row) => ({
      label: `${row.prompt_key ?? "agent"} · ${row.model_provider ?? "—"}`,
      status: row.status === "failed" ? "failed" : row.status === "completed" ? "completed" : "running",
      detail:
        row.status === "failed"
          ? row.error_message ?? "模型呼叫失敗。"
          : `${row.model_name ?? "—"} · ${formatDateTime(row.created_at)}`
    }));
  }
  const { data: analysisData } = await supabase
    .from("market_analysis_runs")
    .select("*")
    .eq("user_id", user.id)
    .eq("market", activeMarket)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const analysisRow = (analysisData ?? null) as MarketAnalysisRow | null;
  const currency = activeMarket === "TW" ? "NT$" : "US$";
  const events = buildUpcomingEvents(activeMarket, dataPackage);
  const primaryIndex = activeMarket === "TW" ? snapshot.taiex : snapshot.sp500;
  const secondaryIndex = activeMarket === "TW" ? null : snapshot.nasdaq;
  const vix = snapshot.vix;
  const runStatus = runRecord?.status ?? null;
  const hasDataPackage = Boolean(dataPackage.marketSnapshot);
  const reportItems: AnalysisReportItem[] = [
    {
      label: "建立分析資料包",
      status: hasDataPackage ? "completed" : runStatus === "running" && currentStage === "data_package" ? "running" : runStatus === "failed" ? "failed" : "pending",
      detail: hasDataPackage
        ? `已整理持股 ${dataPackage.portfolioCount ?? "—"}、關注 ${dataPackage.watchlistCount ?? "—"}、市場快照與財報日曆。`
        : "尚未完成資料整理。"
    },
    {
      label: "網路研究",
      status:
        hasDataPackage && (stageHasPassed(currentStage, "data_package") || runStatus === "completed")
          ? "completed"
          : runStatus === "running" && currentStage === "data_package"
            ? "running"
            : runStatus === "failed"
              ? "failed"
              : "pending",
      detail: hasDataPackage ? "已為持股與關注清單整理可用新聞/研究資料。" : "等待資料包完成。"
    },
    {
      label: "Team 報告",
      status: reportStatus({
        runStatus,
        count: progress.teamReports,
        expected: progress.expectedTeamReports,
        runningStage: "division",
        currentStage
      }),
      detail: `已產生 ${progress.teamReports}/${progress.expectedTeamReports || "—"} 份 team 報告。`
    },
    {
      label: "Agent 模型分析",
      status:
        progress.failedAgents > 0
          ? "failed"
          : progress.completedAgents > 0
            ? "completed"
            : runStatus === "running"
              ? "running"
              : "pending",
      detail: `模型呼叫完成 ${progress.completedAgents} 次，失敗 ${progress.failedAgents} 次。`
    },
    {
      label: "Division 決策",
      status: reportStatus({
        runStatus,
        count: progress.divisionDecisions,
        expected: progress.expectedDivisionDecisions,
        runningStage: "division",
        currentStage
      }),
      detail: `已完成 ${progress.divisionDecisions}/${progress.expectedDivisionDecisions || "—"} 個 division 決策。`
    },
    {
      label: "委員會決策",
      status: reportStatus({
        runStatus,
        count: progress.committeeDecisions,
        expected: 1,
        runningStage: "committee",
        currentStage
      }),
      detail: progress.committeeDecisions > 0 ? "委員會已產生最終決策。" : "等待 GPT 與 Anthropic division 完成後彙總。"
    },
    {
      label: "推薦寫入",
      status: reportStatus({
        runStatus,
        count: progress.recommendations,
        runningStage: "recommendations",
        currentStage,
        completedByStage: "recommendations"
      }),
      detail: `已寫入 ${progress.recommendations} 筆可追蹤推薦。`
    },
    {
      label: "台股掃描",
      status: reportStatus({
        runStatus,
        count: progress.scanPicks,
        runningStage: "tw_scan",
        currentStage,
        completedByStage: "tw_scan"
      }),
      detail: `台股掃描產生 ${progress.scanPicks} 筆候選。`
    },
    {
      label: "台灣/美國市場分析",
      status: reportStatus({
        runStatus,
        count: progress.marketAnalyses,
        expected: 2,
        runningStage: currentStage === "market_tw" ? "market_tw" : "market_us",
        currentStage
      }),
      detail: `已完成 ${progress.marketAnalyses}/2 個市場分析結果。`
    }
  ];
  const reportSummary =
    runStatus === "completed"
      ? "這次分析已完成，所有產出會顯示在市場分析與歷史報告中。"
      : runStatus === "failed"
        ? stageError(runRecord?.data_package) ?? progress.latestError ?? "這次分析失敗，請查看失敗項目。"
        : stageMessage(runRecord?.data_package) ?? "分析正在分段執行。";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">市場分析</h1>
          <p className="mt-1 text-sm text-slate-600">台灣與美國市場今日回顧與精選推薦。</p>
        </div>
        <div className="space-y-3 text-right">
          <div className="space-y-1">
            <RunAnalysisButton label="執行市場分析" />
            {runId ? (
              <div className="flex justify-end">
                <AnalysisRunReportDialog
                  autoOpen={searchParams.report === "1"}
                  runId={runId}
                  status={typeof runStatus === "string" ? runStatus : null}
                  title="分析執行報告"
                  summary={reportSummary}
                  items={reportItems}
                  agentLogs={agentLogs}
                />
              </div>
            ) : null}
            <p className="text-xs text-slate-500">
              上一次市場分析：{analysisRow?.created_at ? formatDateTime(analysisRow.created_at) : "—"}
            </p>
          </div>
        </div>
      </div>

      {runRecord ? (
        <section className={`rounded-md border p-5 shadow-sm ${statusClass(runRecord.status)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">今日分析狀態</p>
              <h2 className="mt-1 text-lg font-semibold">{statusLabel(runRecord.status)}</h2>
              <p className="mt-1 text-sm">
                {runRecord.status === "completed"
                  ? "全系統分析已完成，可以查看市場分析與歷史報告。"
                  : runRecord.status === "running"
                    ? stageMessage(runRecord.data_package) ?? "正在準備下一個分析階段。"
                    : stageError(runRecord.data_package) ?? progress.latestError ?? "分析失敗，請查看 API 用量。"}
              </p>
            </div>
            {runRecord.status === "completed" && runId ? (
              <Link
                href={`/reports/${runId}`}
                className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100"
              >
                查看完整報告
              </Link>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
            <div className="rounded-md bg-white/70 p-3">
              <div className="text-xs opacity-70">Team 報告</div>
              <div className="mt-1 font-semibold">{progress.teamReports}</div>
            </div>
            <div className="rounded-md bg-white/70 p-3">
              <div className="text-xs opacity-70">Division 決策</div>
              <div className="mt-1 font-semibold">{progress.divisionDecisions}</div>
            </div>
            <div className="rounded-md bg-white/70 p-3">
              <div className="text-xs opacity-70">委員會決策</div>
              <div className="mt-1 font-semibold">{progress.committeeDecisions}</div>
            </div>
            <div className="rounded-md bg-white/70 p-3">
              <div className="text-xs opacity-70">Agent 完成</div>
              <div className="mt-1 font-semibold">{progress.completedAgents}</div>
            </div>
            <div className="rounded-md bg-white/70 p-3">
              <div className="text-xs opacity-70">Agent 失敗</div>
              <div className="mt-1 font-semibold">{progress.failedAgents}</div>
            </div>
          </div>
          {progress.latestError && runRecord.status !== "completed" ? (
            <p className="mt-3 break-words text-xs text-red-700">{progress.latestError.slice(0, 260)}</p>
          ) : null}
        </section>
      ) : null}

      {runRecord?.status === "running" ? (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <AnalysisProgressRunner />
          <p className="text-sm text-slate-600">
            分析分段執行中，頁面每 10 秒自動推進下一步。
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stageMessage(runRecord.data_package) ?? "正在準備下一個分析階段。"}
          </p>
        </div>
      ) : null}

      {runRecord?.status === "failed" ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-5">
          <h2 className="text-lg font-semibold text-red-900">每日分析失敗</h2>
          <p className="mt-1 text-sm text-red-700">
            {stageError(runRecord.data_package) ?? progress.latestError ?? "請檢查 API 用量頁的錯誤訊息後重新執行。"}
          </p>
        </div>
      ) : null}

      <div className="flex w-fit gap-1 rounded-md border border-slate-200 bg-slate-100 p-1">
        {[
          { market: "TW", label: "台灣市場" },
          { market: "US", label: "美國市場" }
        ].map((item) => (
          <Link
            key={item.market}
            href={`?market=${item.market}`}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeMarket === item.market
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600 hover:text-slate-950"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            {activeMarket === "TW" ? "台灣大盤" : "美國大盤"}
          </h2>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${sentimentClass(analysisRow?.sentiment)}`}>
            {sentimentLabel(analysisRow?.sentiment)}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {analysisRow?.sentiment_reason ?? "尚未產生今日市場情緒摘要。"}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <IndexMiniCard
            title={activeMarket === "TW" ? "加權指數" : "S&P 500"}
            value={primaryIndex?.price !== undefined ? formatNumber(primaryIndex.price, 2) : "—"}
            change={primaryIndex?.change ?? null}
            changePct={primaryIndex?.changePct ?? null}
          />
          {activeMarket === "TW" ? (
            <IndexMiniCard
              title="美元/台幣"
              value={snapshot.usdTwd !== undefined ? formatNumber(snapshot.usdTwd, 4) : "—"}
            />
          ) : (
            <IndexMiniCard
              title="NASDAQ"
              value={secondaryIndex?.price !== undefined ? formatNumber(secondaryIndex.price, 2) : "—"}
              change={secondaryIndex?.change ?? null}
              changePct={secondaryIndex?.changePct ?? null}
            />
          )}
          <IndexMiniCard
            title="VIX"
            value={vix?.price !== undefined ? formatNumber(vix.price, 2) : "—"}
            change={vix?.change ?? null}
            changePct={vix?.changePct ?? null}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-950">近期重要事項</h2>
        <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {events.map((event, index) => (
            <div key={`${event.title}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <span className="text-sm font-medium text-slate-950">{event.title}</span>
                {event.detail ? (
                  <span className="ml-2 text-xs text-slate-500">{event.detail}</span>
                ) : null}
              </div>
              <span className="text-xs font-medium text-slate-400">{event.date}</span>
            </div>
          ))}
        </div>
      </section>

      <PickSection
        title={`選股推薦 - ${currency}50 以下`}
        picks={asPickArray(analysisRow?.picks_under_50)}
      />
      <PickSection
        title={`選股推薦 - ${currency}100 以下`}
        picks={asPickArray(analysisRow?.picks_under_100)}
      />
      <PickSection
        title={`選股推薦 - ${currency}200 以下`}
        picks={asPickArray(analysisRow?.picks_under_200)}
      />
      <PickSection title="ETF 推薦" picks={asPickArray(analysisRow?.etf_picks)} />
    </div>
  );
}
