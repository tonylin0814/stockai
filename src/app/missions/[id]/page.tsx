import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { updateMissionAssociations } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { RunMissionButton } from "@/components/run-mission-button";
import { TeamReportTabs } from "@/components/team-report-tabs";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime, formatNumber, formatSignedNumber, formatSignedPercent } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function srcLabel(t: string) {
  return t === "committee" ? "投資委員會" : t === "division" ? "AI 快速分析" : "AI 分析團隊";
}

function consensusClass(level: string | null) {
  if (level === "strong") return "border-green-200 bg-green-50 text-green-800";
  if (level === "weak") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  return "border-red-200 bg-red-50 text-red-800";
}

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
  if (status === "pending") return "待執行";
  return status;
}

function missionTypeLabel(type: string) {
  if (type === "single_stock") return "單一股票分析";
  if (type === "multi_stock") return "多股比較";
  if (type === "portfolio_review") return "投資組合檢視";
  if (type === "watchlist_review") return "關注清單檢視";
  if (type === "theme") return "主題研究";
  if (type === "event") return "事件分析";
  return type || "—";
}

function addDays(value: string | null, days: number) {
  if (!value) return null;
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function isStaleRunningMission(startedAt: unknown) {
  if (!startedAt) return false;
  const started = new Date(String(startedAt)).getTime();
  return Number.isFinite(started) && Date.now() - started > 10 * 60 * 1000;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function quoteRows(dataPackage: unknown) {
  const data = asRecord(dataPackage);
  const mission = asRecord(data.mission);
  const marketSnapshot = asRecord(data.marketSnapshot);
  const related = Array.isArray(mission.relatedSecurities)
    ? mission.relatedSecurities
    : [];
  const rows = related.map((item) => {
    const security = asRecord(item);
    const quote = asRecord(security.quote);
    return {
      label: `${String(security.symbol ?? "—")} ${String(security.name ?? "")}`.trim(),
      quote
    };
  });
  const taiex = asRecord(marketSnapshot.taiex);

  if (Object.keys(taiex).length) {
    rows.push({
      label: "台股加權指數",
      quote: taiex
    });
  }

  return rows;
}

function priceText(value: unknown, qualityState?: unknown) {
  if (qualityState === "missing") {
    return "—";
  }

  const numberValue = asNumber(value);
  return numberValue === null || numberValue === 0 ? "—" : formatNumber(numberValue, 2);
}

function signedText(value: unknown) {
  const numberValue = asNumber(value);
  return numberValue === null ? "—" : formatSignedNumber(numberValue, 2);
}

function percentText(value: unknown) {
  const numberValue = asNumber(value);
  return numberValue === null ? "—" : formatSignedPercent(numberValue);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean).join("；")
    : "—";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function actionLabel(value: unknown) {
  const action = String(value ?? "");
  const labels: Record<string, string> = {
    buy: "\u8cb7\u9032",
    small_buy: "\u5c0f\u8cb7",
    add: "\u52a0\u78bc",
    hold: "\u6301\u6709",
    wait: "\u7b49\u5f85",
    reduce: "\u6e1b\u78bc",
    sell: "\u8ce3\u51fa",
    avoid: "\u907f\u958b",
    no_action: "\u4e0d\u884c\u52d5"
  };
  return labels[action] ?? (action || "-");
}

function modelLabel(division: Record<string, unknown>) {
  const provider = String(division.model_provider ?? division.division ?? "");
  if (provider.includes("Anthropic") || provider.includes("Claude")) return "Claude";
  if (provider.includes("OpenAI") || provider.includes("GPT")) return "GPT";
  return String(division.division ?? "模型");
}

function advisorProfile(value: unknown) {
  const text = String(value ?? "");

  if (text.includes("Claire") || text.includes("Anthropic") || text.includes("Claude")) {
    return { name: "Claire", image: "/advisors/claire.png" };
  }

  return { name: "Monica", image: "/advisors/monica.png" };
}

const committeeAdvisor = { name: "Kevin", image: "/advisors/kevin.png" };

function comparisonSummary(divisions: Array<Record<string, unknown>>) {
  const completed = divisions.filter((division) =>
    Object.keys(asRecord(division.mission_decision)).length
  );
  const actions = completed.map((division) => String(division.decision_action ?? ""));
  const confidences = completed
    .map((division) => asNumber(division.confidence))
    .filter((value): value is number => value !== null);
  const priceLines = completed.map((division) => {
    const decision = asRecord(division.mission_decision);
    return `${modelLabel(division)} 買進區間 ${String(decision.buyZone ?? "—")}，目標 ${String(
      decision.targetPrice ?? "—"
    )}，停損 ${String(decision.stopLoss ?? "—")}`;
  });
  const sameAction = actions.length > 0 && actions.every((action) => action === actions[0]);

  return {
    consensus: sameAction
      ? `模型共識：${actionLabel(actions[0])}`
      : `模型分歧：${completed
          .map((division) => `${modelLabel(division)} ${actionLabel(division.decision_action)}`)
          .join("，")}`,
    confidence:
      confidences.length > 0
        ? `信心區間：${Math.min(...confidences)} - ${Math.max(...confidences)}`
        : "信心區間：—",
    price: priceLines.length ? priceLines.join("；") : "價格區間：—"
  };
}

function ScenarioSummary({ scenarios }: { scenarios: Record<string, unknown> }) {
  const bull = asRecord(scenarios.bull);
  const bear = asRecord(scenarios.bear);
  const base = asRecord(scenarios.base);

  if (!bull.trigger && !bear.trigger && !base.trigger) return null;

  const items = [
    { label: "做多", color: "bg-green-500", text: "text-green-700", data: bull },
    { label: "做空/防守", color: "bg-red-500", text: "text-red-700", data: bear },
    { label: "盤整", color: "bg-slate-400", text: "text-slate-700", data: base }
  ];

  return (
    <div className="space-y-2 text-xs">
      {items.map((item) => (
        <div key={item.label} className="flex gap-2">
          <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${item.color}`} />
          <div>
            <span className={`font-medium ${item.text}`}>
              {item.label} {String(item.data.probability ?? "?")}%
            </span>
            <span className="ml-2 text-slate-600">
              {String(item.data.trigger ?? "—")} → {String(item.data.target ?? "—")}
            </span>
            {item.data.action ? (
              <span className="ml-2 text-slate-500">{String(item.data.action)}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-6">
      <h1 className="text-2xl font-semibold text-red-900">任務結果讀取失敗</h1>
      <p className="mt-2 break-words text-sm text-red-700">{message}</p>
    </div>
  );
}

export default async function MissionResultPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  if (!user) return null;

  const { data: mission, error: missionError } = await supabase
    .from("stocks_missions")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (missionError) {
    return <LoadErrorCard message={missionError.message} />;
  }

  if (!mission) notFound();

  const missionRow = mission as Record<string, unknown>;
  let status = String(missionRow.status ?? "pending");

  if (status === "running" && isStaleRunningMission(missionRow.started_at)) {
    const { error: staleUpdateError } = await supabase
      .from("stocks_missions")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: "先前分析逾時或中斷，已自動標記為失敗。"
      })
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (staleUpdateError) {
      return <LoadErrorCard message={staleUpdateError.message} />;
    }
    status = "failed";
    missionRow.status = "failed";
    missionRow.completed_at = new Date().toISOString();
    missionRow.error_message = "先前分析逾時或中斷，已自動標記為失敗。";
  }

  const [holdingsResult, watchlistResult, linksResult] = await Promise.all([
    supabase
      .from("stocks_portfolio_holdings")
      .select("id, security_id, securities:stocks_securities(symbol, market, name)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("stocks_watchlist_items")
      .select("id, security_id, securities:stocks_securities(symbol, market, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("stocks_mission_links")
      .select("portfolio_holding_id, watchlist_item_id, link_type")
      .eq("user_id", user.id)
      .eq("mission_id", params.id)
      .in("link_type", ["portfolio", "watchlist"])
  ]);

  if (holdingsResult.error) return <LoadErrorCard message={holdingsResult.error.message} />;
  if (watchlistResult.error) return <LoadErrorCard message={watchlistResult.error.message} />;
  if (linksResult.error) return <LoadErrorCard message={linksResult.error.message} />;

  const portfolioOptions = ((holdingsResult.data ?? []) as unknown as Array<{
    id: string;
    securities: { symbol: string; market: string; name: string } | null;
  }>).filter((item) => item.securities);
  const watchlistOptions = ((watchlistResult.data ?? []) as unknown as Array<{
    id: string;
    securities: { symbol: string; market: string; name: string } | null;
  }>).filter((item) => item.securities);
  const currentPortfolioHoldingId =
    ((linksResult.data ?? []) as Array<{ portfolio_holding_id: string | null; link_type: string }>)
      .find((link) => link.link_type === "portfolio")?.portfolio_holding_id ?? "";
  const currentWatchlistItemId =
    ((linksResult.data ?? []) as Array<{ watchlist_item_id: string | null; link_type: string }>)
      .find((link) => link.link_type === "watchlist")?.watchlist_item_id ?? "";

  const associationSection = (
    <form action={updateMissionAssociations} className="mt-5 border-t border-slate-100 pt-4">
      <input type="hidden" name="missionId" value={params.id} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">關聯到關注清單</span>
          <select
            name="watchlistItemId"
            defaultValue={currentWatchlistItemId}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="">不關聯</option>
            {watchlistOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.securities!.symbol} - {item.securities!.name}（{item.securities!.market}）
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">關聯到投資組合</span>
          <select
            name="portfolioHoldingId"
            defaultValue={currentPortfolioHoldingId}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="">不關聯</option>
            {portfolioOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.securities!.symbol} - {item.securities!.name}（{item.securities!.market}）
              </option>
            ))}
          </select>
        </label>

        <PendingSubmitButton
          idleLabel="儲存關聯"
          pendingLabel="儲存中..."
          variant="secondary"
        />
      </div>
    </form>
  );

  const detailSection = (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-950">{String(missionRow.title)}</h1>
      <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
        <p>原始問題：{String(missionRow.original_question ?? "—")}</p>
        <p>任務類型：{missionTypeLabel(String(missionRow.mission_type ?? ""))}</p>
        <p>相關代號：{Array.isArray(missionRow.related_symbols) ? missionRow.related_symbols.join(", ") : "—"}</p>
        <p>建立時間：{formatDateTime(String(missionRow.created_at ?? ""))}</p>
        <p>完成時間：{missionRow.completed_at ? formatDateTime(String(missionRow.completed_at)) : "—"}</p>
        <div className="flex items-center gap-2">
          <span>狀態：</span>
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}>
            {statusLabel(status)}
          </span>
        </div>
      </div>
      {associationSection}
    </section>
  );
  const backLink = (
    <Link
      href="/missions"
      className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
    >
      返回任務中心
    </Link>
  );
  const sourceRows = quoteRows(missionRow.data_package);
  const sourceSection = sourceRows.length ? (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-slate-950">使用資料</h2>
      <Table>
        <thead>
          <tr>
            <Th>項目</Th>
            <Th>價格</Th>
            <Th>漲跌</Th>
            <Th>漲跌幅</Th>
            <Th>資料時間</Th>
            <Th>品質</Th>
          </tr>
        </thead>
        <tbody>
          {sourceRows.map((row) => (
            <tr key={row.label}>
              <Td>{row.label}</Td>
              <Td>{priceText(row.quote.price, row.quote.qualityState)}</Td>
              <Td>{signedText(row.quote.change)}</Td>
              <Td>{percentText(row.quote.changePct)}</Td>
              <Td>{formatDateTime(String(row.quote.sourceUpdatedAt ?? ""))}</Td>
              <Td>{String(row.quote.qualityState ?? "—")}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  ) : null;

  if (status === "pending") {
    return (
      <div className="space-y-5">
        {backLink}
        {detailSection}
        <RunMissionButton missionId={params.id} />
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="space-y-5">
        {backLink}
        <AutoRefresh />
        {detailSection}
        <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">任務分析執行中…頁面每 10 秒自動更新。</p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-5">
        {backLink}
        {detailSection}
        {sourceSection}
        <div className="rounded-md border border-red-200 bg-red-50 p-6">
          <h2 className="text-xl font-semibold text-red-900">任務分析失敗</h2>
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">任務失敗</p>
            <p className="mt-1 break-words text-sm text-red-700">
              {String(missionRow.error_message ?? "未知錯誤")}
            </p>
          </div>
          <div className="mt-4">
            <RunMissionButton missionId={params.id} label="重新執行分析" />
          </div>
        </div>
      </div>
    );
  }

  let committeeResult;
  let divisionResult;
  let teamResult;
  let recommendationResult;

  try {
    [committeeResult, divisionResult, teamResult, recommendationResult] =
      await Promise.all([
        supabase
          .from("stocks_committee_decisions")
          .select("*")
          .eq("mission_id", params.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("stocks_division_decisions")
          .select("*")
          .eq("mission_id", params.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("stocks_team_reports")
          .select("id, division, team_name, market_view, portfolio_review, final_team_view")
          .eq("mission_id", params.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("stocks_recommendations")
          .select("id, source_type, source_name, action, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, securities:stocks_securities(symbol, market)")
          .eq("mission_id", params.id)
          .order("created_at", { ascending: true })
      ]);
  } catch (error) {
    return (
      <div className="space-y-5">
        {backLink}
        {detailSection}
        {sourceSection}
        <LoadErrorCard message={error instanceof Error ? error.message : "未知錯誤"} />
      </div>
    );
  }

  const resultError =
    committeeResult.error ??
    divisionResult.error ??
    teamResult.error ??
    recommendationResult.error;

  if (resultError) {
    return (
      <div className="space-y-5">
        {backLink}
        {detailSection}
        {sourceSection}
        <LoadErrorCard message={resultError.message} />
      </div>
    );
  }
  const committees = (committeeResult.data ?? []) as Array<Record<string, unknown>>;
  const divisions = (divisionResult.data ?? []) as Array<Record<string, unknown>>;
  const comparison = comparisonSummary(divisions);
  const teams = (teamResult.data ?? []) as Parameters<typeof TeamReportTabs>[0]["reports"];
  const recommendations = (recommendationResult.data ?? []) as unknown as Array<{
    id: string;
    source_type: string;
    source_name: string;
    action: string;
    confidence: number;
    buy_zone_low: number | null;
    buy_zone_high: number | null;
    target_price: number | null;
    stop_loss: number | null;
    securities: { symbol: string; market: string } | null;
  }>;
  const recommendationIds = recommendations.map((recommendation) => recommendation.id);
  const { data: outcomes, error: outcomesError } = recommendationIds.length
    ? await supabase
        .from("stocks_recommendation_outcomes")
        .select("horizon_days")
        .in("recommendation_id", recommendationIds)
    : { data: [], error: null };

  if (outcomesError) {
    return (
      <div className="space-y-5">
        {detailSection}
        {sourceSection}
        <LoadErrorCard message={outcomesError.message} />
      </div>
    );
  }
  const outcomeHorizons = new Set(((outcomes ?? []) as Array<{ horizon_days: number }>).map((row) => row.horizon_days));
  const completedAt = missionRow.completed_at ? String(missionRow.completed_at) : null;

  return (
    <div className="space-y-8">
      {backLink}
      {detailSection}
      {sourceSection}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{"\u59d4\u54e1\u6703\u6c7a\u7b56"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {comparison.consensus} | {comparison.confidence}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {committees.map((item, index) => {
            const finalScenarios = asRecord(item.final_scenarios ?? item.finalScenarios);
            const provider = String(item.model_provider ?? "");
            const label = provider === "Anthropic" ? "Committee B - Claude" : "Committee A - GPT";

            return (
              <article key={`${provider}-${index}`} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
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
                      <h3 className="text-base font-semibold text-slate-950">{label}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {committeeAdvisor.name} / {formatDateTime(String(item.created_at ?? ""))}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-xs font-medium ${consensusClass(String(item.consensus_level ?? "none"))}`}>
                    {String(item.consensus_level ?? "none")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">{"\u5efa\u8b70"}</p>
                    <p className="font-medium text-slate-950">{actionLabel(item.action_type)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{"\u4fe1\u5fc3"}</p>
                    <p className="font-medium text-slate-950">{String(item.confidence ?? "-")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{"\u5141\u8a31\u884c\u52d5"}</p>
                    <p className="font-medium text-slate-950">{item.is_action_allowed ? "\u662f" : "\u5426"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{"\u6700\u7d42\u52d5\u4f5c"}</p>
                    <p className="font-medium text-slate-950">{actionLabel(item.final_action)}</p>
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {String(item.decision_summary ?? "-")}
                </p>
                {Object.keys(finalScenarios).length ? (
                  <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-slate-700">{"\u60c5\u5883\u8a55\u4f30"}</p>
                    <ScenarioSummary scenarios={finalScenarios} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{"\u6a21\u578b\u5206\u6790\u5c0d\u7167"}</h2>
          <div className="mt-2 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            <p>{comparison.consensus}</p>
            <p className="mt-1">{comparison.price}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {divisions.map((division) => {
            const missionDecision = asRecord(division.mission_decision);
            const scenarios = asRecord(missionDecision.scenarios);
            const risks = asStringArray(missionDecision.keyRisks).slice(0, 4);
            const conditions = asStringArray(missionDecision.conditionsToAct).slice(0, 4);
            const technicals = asStringArray(missionDecision.technicalHighlights).slice(0, 4);
            const advisor = advisorProfile(division.division_manager ?? division.model_provider ?? division.division);

            return (
              <article key={`analysis-${String(division.id)}`} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
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
                      <h3 className="text-base font-semibold text-slate-950">{modelLabel(division)}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {String(division.division ?? "-")} / {String(division.division_manager ?? advisor.name)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">{actionLabel(division.decision_action)}</p>
                    <p className="text-xs text-slate-500">{"\u4fe1\u5fc3"} {String(division.confidence ?? "-")}</p>
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-700">
                  {String(missionDecision.summary ?? division.market_summary ?? "-")}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{"\u8cb7\u9032\u5340\u9593"}</p>
                    <p className="mt-1 font-medium text-slate-950">{String(missionDecision.buyZone ?? "-")}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{"\u76ee\u6a19\u50f9"}</p>
                    <p className="mt-1 font-medium text-slate-950">{String(missionDecision.targetPrice ?? "-")}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{"\u505c\u640d"}</p>
                    <p className="mt-1 font-medium text-slate-950">{String(missionDecision.stopLoss ?? "-")}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{"\u6838\u5fc3\u7406\u7531"}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {String(missionDecision.reason ?? "-")}
                    </p>
                  </div>
                  {technicals.length ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{"\u6280\u8853\u91cd\u9ede"}</p>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                        {technicals.map((item) => <li key={item}>- {item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {risks.length ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{"\u4e3b\u8981\u98a8\u96aa"}</p>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                        {risks.map((item) => <li key={item}>- {item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {conditions.length ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{"\u884c\u52d5\u689d\u4ef6"}</p>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                        {conditions.map((item) => <li key={item}>- {item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
                {Object.keys(scenarios).length ? (
                  <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-slate-700">{"\u60c5\u5883\u8a55\u4f30"}</p>
                    <ScenarioSummary scenarios={scenarios} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Team Reports</h2>
        <TeamReportTabs reports={teams} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">任務建議</h2>
        <Table>
          <thead>
            <tr>
              <Th>代號</Th>
              <Th>市場</Th>
              <Th>來源</Th>
              <Th>行動</Th>
              <Th>信心</Th>
              <Th>買進區間</Th>
              <Th>目標價</Th>
              <Th>停損</Th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((recommendation) => (
              <tr key={recommendation.id}>
                <Td>{recommendation.securities?.symbol ?? "—"}</Td>
                <Td>{recommendation.securities?.market ?? "—"}</Td>
                <Td>{srcLabel(recommendation.source_type)}</Td>
                <Td>{recommendation.action}</Td>
                <Td>{recommendation.confidence}</Td>
                <Td>{recommendation.buy_zone_low ?? "—"} - {recommendation.buy_zone_high ?? "—"}</Td>
                <Td>{recommendation.target_price ?? "—"}</Td>
                <Td>{recommendation.stop_loss ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">後續追蹤</h2>
        <Table>
          <thead>
            <tr>
              <Th>追蹤週期</Th>
              <Th>評估日期</Th>
              <Th>狀態</Th>
            </tr>
          </thead>
          <tbody>
            {[7, 30, 90].map((days) => {
              const evaluationDate = addDays(completedAt, days);
              const due = evaluationDate ? evaluationDate.getTime() <= Date.now() : false;
              const statusText = !due ? "待評估" : outcomeHorizons.has(days) ? "已到期" : "未追蹤";
              return (
                <tr key={days}>
                  <Td>{days}日後追蹤</Td>
                  <Td>{evaluationDate ? formatDateTime(evaluationDate.toISOString()) : "—"}</Td>
                  <Td>{statusText}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
