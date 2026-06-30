import { NextResponse } from "next/server";
import { computeWeeklyScore } from "@/lib/analysis/pipeline/sim-scoring";
import { verifyPredictions } from "@/lib/analysis/pipeline/sim-predictions";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

type Division = "gpt" | "anthropic";
type Portfolio = {
  id: string;
  market: "US" | "TW";
  starting_cash: number;
  current_cash: number;
};
type Position = {
  portfolio_id: string;
  shares: number;
  avg_cost_price: number;
  current_price: number | null;
};
type Trade = {
  action: string;
  outcome_pnl: number | null;
  outcome_pct: number | null;
  conviction: number | null;
  total_amount: number;
  symbol: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function weekBounds() {
  const today = new Date();
  const day = today.getDay() || 7;
  const start = new Date(today);
  start.setDate(today.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10)
  };
}

function valueForMarket(portfolio: Portfolio | undefined, positions: Position[]) {
  return (
    Number(portfolio?.current_cash ?? 0) +
    positions.reduce(
      (sum, position) => sum + Number(position.shares) * Number(position.current_price ?? position.avg_cost_price),
      0
    )
  );
}

async function benchmarkReturn(market: "US" | "TW") {
  const provider = getMarketDataProvider();
  const history = await provider.getHistory(market === "US" ? "^IXIC" : "^TWII", market, 8).catch(() => []);
  if (history.length < 2) return 0;
  const first = history[0]?.close ?? 0;
  const last = history[history.length - 1]?.close ?? 0;
  return first > 0 ? ((last - first) / first) * 100 : 0;
}

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入。" }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { weekStart, weekEnd } = weekBounds();
  const today = todayIsoDate();

  try {
    const provider = getMarketDataProvider();
    for (const division of ["gpt", "anthropic"] as Division[]) {
      await verifyPredictions({ supabase, userId: user.id, division, verifyDate: today, provider });

      const { data: portfoliosData } = await supabase
        .from("sim_portfolios")
        .select("*")
        .eq("user_id", user.id)
        .eq("division", division);
      const portfolios = (portfoliosData ?? []) as Portfolio[];
      const portfolioIds = portfolios.map((portfolio) => portfolio.id);
      const [{ data: positionsData }, { data: tradesData }, { data: predictionsData }, { data: reportsData }] =
        await Promise.all([
          supabase
            .from("sim_positions")
            .select("*")
            .eq("status", "open")
            .in("portfolio_id", portfolioIds.length ? portfolioIds : ["00000000-0000-0000-0000-000000000000"]),
          supabase
            .from("sim_trades")
            .select("*")
            .gte("session_date", weekStart)
            .lte("session_date", weekEnd)
            .in("portfolio_id", portfolioIds.length ? portfolioIds : ["00000000-0000-0000-0000-000000000000"]),
          supabase
            .from("sim_predictions")
            .select("*")
            .eq("user_id", user.id)
            .eq("division", division)
            .gte("report_date", weekStart)
            .lte("report_date", weekEnd),
          supabase
            .from("sim_daily_reports")
            .select("report_date, us_portfolio_value, tw_portfolio_value")
            .eq("user_id", user.id)
            .eq("division", division)
            .gte("report_date", weekStart)
            .lte("report_date", weekEnd)
            .order("report_date", { ascending: true })
        ]);

      const positions = (positionsData ?? []) as Position[];
      const usPortfolio = portfolios.find((portfolio) => portfolio.market === "US");
      const twPortfolio = portfolios.find((portfolio) => portfolio.market === "TW");
      const usPositions = positions.filter((position) => position.portfolio_id === usPortfolio?.id);
      const twPositions = positions.filter((position) => position.portfolio_id === twPortfolio?.id);
      const usEndValue = valueForMarket(usPortfolio, usPositions);
      const twEndValue = valueForMarket(twPortfolio, twPositions);
      const usStart = Number(usPortfolio?.starting_cash ?? 10000);
      const twStart = Number(twPortfolio?.starting_cash ?? 300000);
      const usReturnPct = usStart > 0 ? ((usEndValue - usStart) / usStart) * 100 : 0;
      const twReturnPct = twStart > 0 ? ((twEndValue - twStart) / twStart) * 100 : 0;
      const usBenchmarkPct = await benchmarkReturn("US");
      const twBenchmarkPct = await benchmarkReturn("TW");
      const trades = (tradesData ?? []) as Trade[];
      const reports = (reportsData ?? []) as Array<{
        report_date: string;
        us_portfolio_value: number | null;
        tw_portfolio_value: number | null;
      }>;
      const snapshots = reports.map((report) => ({
        date: report.report_date,
        value: Number(report.us_portfolio_value ?? 0) + Number(report.tw_portfolio_value ?? 0)
      }));
      if (!snapshots.length) {
        snapshots.push({ date: weekEnd, value: usEndValue + twEndValue });
      }

      const breakdown = await computeWeeklyScore({
        usReturnPct,
        twReturnPct,
        usBenchmarkPct,
        twBenchmarkPct,
        closedTrades: trades,
        weeklySnapshots: snapshots,
        predictions: (predictionsData ?? []) as Array<{
          condition_met: boolean | null;
          action_taken: boolean | null;
          verified_at: string | null;
        }>
      });
      const previousScores = await supabase
        .from("sim_scores")
        .select("total_score, us_alpha_pct, win_rate_pct")
        .eq("user_id", user.id)
        .eq("division", division);
      const previous = (previousScores.data ?? []) as Array<{
        total_score: number;
        us_alpha_pct: number | null;
        win_rate_pct: number | null;
      }>;
      const cumulativeTotal =
        [...previous.map((row) => Number(row.total_score)), breakdown.total].reduce(
          (sum, value) => sum + value,
          0
        ) /
        (previous.length + 1);

      await supabase.from("sim_scores").upsert(
        {
          user_id: user.id,
          division,
          score_date: weekEnd,
          week_start: weekStart,
          week_end: weekEnd,
          alpha_score: breakdown.alpha.score,
          win_rate_score: breakdown.winRate.score,
          risk_control_score: breakdown.riskControl.score,
          conviction_score: breakdown.convictionCalibration.score,
          prediction_score: breakdown.predictionAccuracy.score,
          total_score: breakdown.total,
          us_return_pct: usReturnPct,
          tw_return_pct: twReturnPct,
          us_benchmark_pct: usBenchmarkPct,
          tw_benchmark_pct: twBenchmarkPct,
          us_alpha_pct: breakdown.metrics.usAlpha,
          tw_alpha_pct: breakdown.metrics.twAlpha,
          win_rate_pct: breakdown.metrics.winRatePct,
          trades_evaluated: breakdown.metrics.tradesEvaluated,
          winning_trades: breakdown.metrics.winningTrades,
          losing_trades: breakdown.metrics.losingTrades,
          max_drawdown_pct: breakdown.metrics.maxDrawdownPct,
          peak_value: breakdown.metrics.peakValue,
          trough_value: breakdown.metrics.troughValue,
          avg_conviction_winners: breakdown.metrics.avgConvictionWinners,
          avg_conviction_losers: breakdown.metrics.avgConvictionLosers,
          predictions_made: breakdown.metrics.predictionsMade,
          predictions_correct: breakdown.metrics.predictionsCorrect,
          prediction_accuracy_pct: breakdown.metrics.predictionAccuracyPct,
          badges: breakdown.badges,
          cumulative_total: cumulativeTotal,
          cumulative_alpha: breakdown.metrics.usAlpha + breakdown.metrics.twAlpha,
          cumulative_win_rate_pct: breakdown.metrics.winRatePct
        },
        { onConflict: "user_id,division,score_date" }
      );

      await supabase.from("sim_weekly_evals").upsert(
        {
          user_id: user.id,
          division,
          week_start: weekStart,
          week_end: weekEnd,
          us_start_value: usStart,
          us_end_value: usEndValue,
          us_week_return_pct: usReturnPct,
          us_cumulative_return_pct: usReturnPct,
          us_benchmark_return_pct: usBenchmarkPct,
          tw_start_value: twStart,
          tw_end_value: twEndValue,
          tw_week_return_pct: twReturnPct,
          tw_cumulative_return_pct: twReturnPct,
          tw_benchmark_return_pct: twBenchmarkPct,
          trades_count: trades.length,
          winning_trades: breakdown.metrics.winningTrades,
          losing_trades: breakdown.metrics.losingTrades,
          avg_conviction: trades.length
            ? trades.reduce((sum, trade) => sum + Number(trade.conviction ?? 0), 0) / trades.length
            : null,
          best_trade: trades[0] ?? null,
          worst_trade: trades[trades.length - 1] ?? null,
          strategy_review: `本週總分 ${breakdown.total}/100。${breakdown.alpha.detail}，${breakdown.riskControl.detail}。`,
          next_week_plan: "延續高品質資料優先、嚴格控管單一持倉比例，並追蹤停損警示。"
        },
        { onConflict: "user_id,division,week_end" }
      );
    }

    return NextResponse.json({ message: "每週評估完成。" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "每週評估失敗。" },
      { status: 500 }
    );
  }
}
