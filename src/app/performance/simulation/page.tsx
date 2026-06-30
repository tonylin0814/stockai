import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SimScoreCard } from "@/components/sim-score-card";
import { SimulationActionButtons } from "@/components/simulation-action-buttons";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime, formatNumber, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Division = "gpt" | "anthropic";
type Portfolio = {
  id: string;
  division: Division;
  market: "US" | "TW";
  starting_cash: number;
  current_cash: number;
};
type Position = {
  id: string;
  portfolio_id: string;
  symbol: string;
  market: "US" | "TW";
  name: string;
  shares: number;
  avg_cost_price: number;
  current_price: number | null;
  stop_flagged: boolean;
};
type Trade = {
  id: string;
  action: string;
  symbol: string;
  market: "US" | "TW";
  name: string;
  shares: number;
  price_per_share: number;
  total_amount: number;
  outcome_pnl: number | null;
  outcome_pct: number | null;
  conviction: number | null;
  executed_at: string;
};
type DailyReport = {
  report_date: string;
  trades_summary: string;
  positions_review: string;
  market_commentary: string;
  tomorrow_outlook: string;
  planned_actions: string | null;
};
type SimScore = {
  total_score: number;
  alpha_score: number;
  win_rate_score: number;
  risk_control_score: number;
  conviction_score: number;
  prediction_score: number;
  badges: unknown;
  cumulative_total: number | null;
};

function divisionLabel(division: Division) {
  return division === "gpt" ? "GPT Division" : "Anthropic Division";
}

function tradeActionLabel(action: string) {
  return action === "buy" ? "買入" : "賣出";
}

function positionValue(position: Position) {
  return Number(position.shares) * Number(position.current_price ?? position.avg_cost_price);
}

function positionPct(position: Position) {
  const current = Number(position.current_price ?? position.avg_cost_price);
  const avg = Number(position.avg_cost_price);
  return avg > 0 ? ((current - avg) / avg) * 100 : 0;
}

function portfolioCash(portfolio: Portfolio | undefined) {
  return Number(portfolio?.current_cash ?? 0);
}

function portfolioTotal(portfolio: Portfolio | undefined, positions: Position[]) {
  return portfolioCash(portfolio) + positions.reduce((sum, position) => sum + positionValue(position), 0);
}

function positionsTotal(positions: Position[]) {
  return positions.reduce((sum, position) => sum + positionValue(position), 0);
}

function money(value: number, market: "US" | "TW") {
  return `${market === "US" ? "US$" : "NT$"}${formatNumber(value, market === "US" ? 2 : 0)}`;
}

export default async function SimulationPage({
  searchParams
}: {
  searchParams?: { division?: string; action?: string };
}) {
  const division: Division = searchParams?.division === "anthropic" ? "anthropic" : "gpt";
  const actionFilter = searchParams?.action === "buy" || searchParams?.action === "sell" ? searchParams.action : "all";
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    portfoliosResult,
    positionsResult,
    tradesResult,
    latestReportResult,
    latestScoreResult,
    scoresResult,
    weeklyEvalsResult,
    allScoresResult
  ] = await Promise.all([
    supabase.from("sim_portfolios").select("*").eq("user_id", user.id).eq("division", division),
    supabase
      .from("sim_positions")
      .select("*, sim_portfolios!inner(division, market, user_id)")
      .eq("sim_portfolios.user_id", user.id)
      .eq("sim_portfolios.division", division)
      .eq("status", "open"),
    supabase
      .from("sim_trades")
      .select("*, sim_portfolios!inner(division, market, user_id)")
      .eq("sim_portfolios.user_id", user.id)
      .eq("sim_portfolios.division", division)
      .order("executed_at", { ascending: false })
      .limit(20),
    supabase
      .from("sim_daily_reports")
      .select("*")
      .eq("user_id", user.id)
      .eq("division", division)
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sim_scores")
      .select("*")
      .eq("user_id", user.id)
      .eq("division", division)
      .order("score_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sim_scores")
      .select("*")
      .eq("user_id", user.id)
      .eq("division", division)
      .order("score_date", { ascending: true })
      .limit(8),
    supabase
      .from("sim_weekly_evals")
      .select("*")
      .eq("user_id", user.id)
      .eq("division", division)
      .order("week_end", { ascending: false })
      .limit(8),
    supabase
      .from("sim_scores")
      .select("division, total_score, badges")
      .eq("user_id", user.id)
      .order("score_date", { ascending: false })
  ]);

  const portfolios = (portfoliosResult.data ?? []) as Portfolio[];
  const positions = (positionsResult.data ?? []) as unknown as Position[];
  const trades = ((tradesResult.data ?? []) as unknown as Trade[]).filter(
    (trade) => actionFilter === "all" || trade.action === actionFilter
  );
  const latestReport = latestReportResult.data as DailyReport | null;
  const latestScore = latestScoreResult.data as SimScore | null;
  const scoreHistory = (scoresResult.data ?? []) as SimScore[];
  const weeklyEvals = (weeklyEvalsResult.data ?? []) as Array<Record<string, unknown>>;
  const allScores = (allScoresResult.data ?? []) as Array<{
    division: Division;
    total_score: number;
    badges: unknown;
  }>;
  const gptScore = allScores.find((score) => score.division === "gpt")?.total_score ?? null;
  const antScore = allScores.find((score) => score.division === "anthropic")?.total_score ?? null;
  const gptWins = allScores.filter(
    (score) => score.division === "gpt" && Number(score.total_score) > Number(antScore ?? -1)
  ).length;
  const antWins = allScores.filter(
    (score) => score.division === "anthropic" && Number(score.total_score) > Number(gptScore ?? -1)
  ).length;
  const usPortfolio = portfolios.find((portfolio) => portfolio.market === "US");
  const twPortfolio = portfolios.find((portfolio) => portfolio.market === "TW");
  const usPositions = positions.filter((position) => position.market === "US");
  const twPositions = positions.filter((position) => position.market === "TW");
  const usCash = portfolioCash(usPortfolio);
  const twCash = portfolioCash(twPortfolio);
  const usAssets = portfolioTotal(usPortfolio, usPositions);
  const twAssets = portfolioTotal(twPortfolio, twPositions);
  const usInvested = positionsTotal(usPositions);
  const twInvested = positionsTotal(twPositions);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">模擬交易競賽</h1>
          <p className="mt-1 text-sm text-slate-600">
            GPT Division 與 Anthropic Division 各自管理美股與台股虛擬資金。
          </p>
        </div>
        <SimulationActionButtons />
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">GPT Division</p>
            <p className="text-3xl font-semibold text-blue-700">
              {gptScore === null ? "—" : formatNumber(Number(gptScore), 0)}
            </p>
            <p className="text-xs text-slate-500">本週分數</p>
          </div>
          <div className="text-left md:text-center">
            <p className="text-xs text-slate-400">累積對戰</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              GPT {gptWins} 勝 / Anthropic {antWins} 勝
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {gptScore !== null && antScore !== null
                ? gptScore >= antScore
                  ? "目前 GPT Division 領先"
                  : "目前 Anthropic Division 領先"
                : "尚無完整評分"}
            </p>
          </div>
          <div className="md:text-right">
            <p className="text-sm text-slate-500">Anthropic Division</p>
            <p className="text-3xl font-semibold text-violet-700">
              {antScore === null ? "—" : formatNumber(Number(antScore), 0)}
            </p>
            <p className="text-xs text-slate-500">本週分數</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {(["gpt", "anthropic"] as Division[]).map((item) => (
          <Link
            key={item}
            href={`/performance/simulation?division=${item}`}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium",
              item === division
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            {divisionLabel(item)}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">資產分幣別</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{money(usAssets, "US")}</p>
          <p className="text-sm font-semibold text-slate-950">{money(twAssets, "TW")}</p>
          <p className="mt-2 text-xs text-slate-500">
            已投入 {money(usInvested, "US")} / {money(twInvested, "TW")}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">美股資產</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {money(usAssets, "US")}
          </p>
          <div className="mt-2 space-y-1 text-xs text-slate-500">
            <p>現金 {money(usCash, "US")}</p>
            <p>持股市值 {money(usInvested, "US")}</p>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">台股資產</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {money(twAssets, "TW")}
          </p>
          <div className="mt-2 space-y-1 text-xs text-slate-500">
            <p>現金 {money(twCash, "TW")}</p>
            <p>持股市值 {money(twInvested, "TW")}</p>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">本週積分</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {latestScore ? `${formatNumber(Number(latestScore.total_score), 0)} / 100` : "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <SimScoreCard score={latestScore} />
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">累積報酬 vs 大盤</h2>
          <div className="mt-4 h-52 rounded-md border border-slate-100 bg-slate-50 p-4">
            {scoreHistory.length ? (
              <div className="flex h-full items-end gap-3">
                {scoreHistory.map((score, index) => (
                  <div key={index} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t bg-slate-900"
                      style={{ height: `${Math.max(6, Math.min(100, Number(score.total_score)))}%` }}
                    />
                    <span className="text-xs text-slate-500">{formatNumber(Number(score.total_score), 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">尚無週評分歷史。</p>
            )}
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">當前持倉</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(["US", "TW"] as const).map((market) => {
            const list = market === "US" ? usPositions : twPositions;
            const portfolio = market === "US" ? usPortfolio : twPortfolio;
            return (
              <div key={market} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-950">{market === "US" ? "美股" : "台股"}</h3>
                  <p className="text-sm text-slate-500">
                    現金 {money(market === "US" ? usCash : twCash, market)}
                  </p>
                </div>
                <div className="space-y-2">
                  {list.map((position) => {
                    const latestTrade = trades.find((trade) => trade.symbol === position.symbol);
                    const content = (
                      <>
                        <span>
                          {position.symbol} {formatNumber(Number(position.shares), 2)}股
                          <span className="ml-2 text-slate-500">
                            {formatNumber(Number(position.avg_cost_price), 2)} →{" "}
                            {formatNumber(Number(position.current_price ?? position.avg_cost_price), 2)}
                          </span>
                        </span>
                        <span className={positionPct(position) >= 0 ? "text-green-700" : "text-red-700"}>
                          {formatSignedPercent(positionPct(position))}
                        </span>
                      </>
                    );

                    return latestTrade ? (
                      <Link
                        key={position.id}
                        href={`/performance/simulation/trade/${latestTrade.id}`}
                        className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div
                        key={position.id}
                        className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
                      >
                        {content}
                      </div>
                    );
                  })}
                  {!list.length ? <p className="text-sm text-slate-500">目前空倉。</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-950">最新日報</h2>
          <span className="text-sm text-slate-500">{latestReport?.report_date ?? "尚無日報"}</span>
        </div>
        {latestReport ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p><span className="font-medium text-slate-950">今日操作：</span>{latestReport.trades_summary}</p>
            <p><span className="font-medium text-slate-950">持倉檢視：</span>{latestReport.positions_review}</p>
            <p><span className="font-medium text-slate-950">明日展望：</span>{latestReport.tomorrow_outlook}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">執行產生日報後會顯示在這裡。</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-950">交易記錄</h2>
          <div className="flex gap-2">
            {[
              { key: "all", label: "全部" },
              { key: "buy", label: "買入" },
              { key: "sell", label: "賣出" }
            ].map((item) => (
              <Link
                key={item.key}
                href={`/performance/simulation?division=${division}&action=${item.key}`}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  actionFilter === item.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>日期</Th>
              <Th>動作</Th>
              <Th>代號</Th>
              <Th>股數</Th>
              <Th>價格</Th>
              <Th>金額</Th>
              <Th>損益</Th>
              <Th>信心</Th>
              <Th>詳情</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <Td>{formatDateTime(trade.executed_at)}</Td>
                <Td>{tradeActionLabel(trade.action)}</Td>
                <Td>{trade.symbol}</Td>
                <Td>{formatNumber(Number(trade.shares), 2)}</Td>
                <Td>{money(Number(trade.price_per_share), trade.market)}</Td>
                <Td>{money(Number(trade.total_amount), trade.market)}</Td>
                <Td className={Number(trade.outcome_pnl ?? 0) >= 0 ? "text-green-700" : "text-red-700"}>
                  {trade.outcome_pnl === null ? "—" : `${money(Number(trade.outcome_pnl), trade.market)} ${formatSignedPercent(Number(trade.outcome_pct) * 100)}`}
                </Td>
                <Td>{trade.conviction === null ? "—" : formatNumber(Number(trade.conviction), 0)}</Td>
                <Td>
                  <Link href={`/performance/simulation/trade/${trade.id}`} className="inline-flex items-center text-slate-700 hover:text-slate-950">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Td>
              </tr>
            ))}
            {!trades.length ? (
              <tr>
                <Td colSpan={9}>尚無交易記錄。</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">每週評估歷史</h2>
        <Table>
          <thead>
            <tr>
              <Th>週期</Th>
              <Th>美股報酬</Th>
              <Th>台股報酬</Th>
              <Th>交易數</Th>
              <Th>策略回顧</Th>
            </tr>
          </thead>
          <tbody>
            {weeklyEvals.map((row) => (
              <tr key={String(row.id)}>
                <Td>{String(row.week_start)} ~ {String(row.week_end)}</Td>
                <Td>{formatSignedPercent(Number(row.us_week_return_pct ?? 0))}</Td>
                <Td>{formatSignedPercent(Number(row.tw_week_return_pct ?? 0))}</Td>
                <Td>{String(row.trades_count ?? 0)}</Td>
                <Td>{String(row.strategy_review ?? "—")}</Td>
              </tr>
            ))}
            {!weeklyEvals.length ? (
              <tr>
                <Td colSpan={5}>尚無每週評估。</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
