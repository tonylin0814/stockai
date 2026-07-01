import { z } from "zod";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import {
  extractPredictions,
  saveExtractedPredictions
} from "@/lib/analysis/pipeline/sim-predictions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Division = "gpt" | "anthropic";
type Portfolio = {
  id: string;
  market: "US" | "TW";
  starting_cash: number;
  current_cash: number;
};
type Position = {
  portfolio_id: string;
  market: "US" | "TW";
  symbol: string;
  name: string;
  shares: number;
  avg_cost_price: number;
  current_price: number | null;
  stop_flagged: boolean;
};
type Trade = {
  action: string;
  symbol: string;
  name: string;
  shares: number;
  price_per_share: number;
  thesis: string;
  market: "US" | "TW";
};

const ReportSchema = z.object({
  trades_summary: z.string(),
  positions_review: z.string(),
  market_commentary: z.string(),
  tomorrow_outlook: z.string(),
  planned_actions: z.string().optional().nullable()
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIsoDate() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

function modelForDivision(division: Division) {
  if (division === "anthropic") {
    return { provider: "Anthropic", model: "claude-haiku-4-5-20251001" };
  }
  return { provider: "OpenAI", model: "gpt-4o" };
}

function portfolioValue(portfolio: Portfolio | undefined, positions: Position[]) {
  return (
    Number(portfolio?.current_cash ?? 0) +
    positions.reduce(
      (sum, position) =>
        sum + Number(position.shares) * Number(position.current_price ?? position.avg_cost_price),
      0
    )
  );
}

function buildReportPrompt(params: {
  division: Division;
  date: string;
  trades: Trade[];
  positions: Position[];
  usCash: number;
  twCash: number;
  usValue: number;
  twValue: number;
}) {
  const tradesText = params.trades.length
    ? params.trades
        .map(
          (trade) =>
            `${trade.action === "buy" ? "買入" : "賣出"} ${trade.symbol} ${trade.name} ${trade.shares}股 @ ${trade.price_per_share}
理由：${trade.thesis}`
        )
        .join("\n\n")
    : "今日無交易";
  const positionsText = params.positions.length
    ? params.positions
        .map((position) => {
          const price = Number(position.current_price ?? position.avg_cost_price);
          const pct =
            Number(position.avg_cost_price) > 0
              ? ((price - Number(position.avg_cost_price)) / Number(position.avg_cost_price)) * 100
              : 0;
          return `${position.symbol} ${position.name}: ${position.shares}股，成本${position.avg_cost_price}，現價${price}，${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%${position.stop_flagged ? "，已觸發停損警示" : ""}`;
        })
        .join("\n")
    : "目前無持倉";

  return `你是 ${params.division === "gpt" ? "GPT Division" : "Anthropic Division"} 的投資組合經理，今日交易結束，撰寫每日報告。

日期：${params.date}

今日操作：
${tradesText}

當前持倉：
${positionsText}

資金狀況：
美股現金：$${params.usCash.toFixed(2)} / 台股現金：NT$${params.twCash.toFixed(0)}
組合總值：美股 $${params.usValue.toFixed(2)} / 台股 NT$${params.twValue.toFixed(0)}

請輸出 JSON：
{
  "trades_summary": "今日操作回顧，100-200字",
  "positions_review": "持倉檢視，100-200字",
  "market_commentary": "大盤看法，50-100字",
  "tomorrow_outlook": "明日展望，100-150字",
  "planned_actions": "明日具體計劃，50-100字，可為null"
}`;
}

export async function runReportForUser(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string
) {
  const reportDate = todayIsoDate();
  const messages: string[] = [];

  for (const division of ["gpt", "anthropic"] as Division[]) {
    const { data: portfoliosData } = await supabase
      .from("stocks_sim_portfolios")
      .select("*")
      .eq("user_id", userId)
      .eq("division", division);
    const portfolios = (portfoliosData ?? []) as Portfolio[];
    const portfolioIds = portfolios.map((portfolio) => portfolio.id);

    const [{ data: tradesData }, { data: positionsData }] = await Promise.all([
      supabase
        .from("stocks_sim_trades")
        .select("*")
        .eq("session_date", reportDate)
        .in("portfolio_id", portfolioIds.length ? portfolioIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase
        .from("stocks_sim_positions")
        .select("*")
        .eq("status", "open")
        .in("portfolio_id", portfolioIds.length ? portfolioIds : ["00000000-0000-0000-0000-000000000000"])
    ]);
    const trades = (tradesData ?? []) as Trade[];
    const positions = (positionsData ?? []) as Position[];
    const usPortfolio = portfolios.find((portfolio) => portfolio.market === "US");
    const twPortfolio = portfolios.find((portfolio) => portfolio.market === "TW");
    const usPositions = positions.filter((position) => position.portfolio_id === usPortfolio?.id);
    const twPositions = positions.filter((position) => position.portfolio_id === twPortfolio?.id);
    const usValue = portfolioValue(usPortfolio, usPositions);
    const twValue = portfolioValue(twPortfolio, twPositions);
    const { data: prevReport } = await supabase
      .from("stocks_sim_daily_reports")
      .select("us_portfolio_value, tw_portfolio_value")
      .eq("user_id", userId)
      .eq("division", division)
      .eq("report_date", yesterdayIsoDate())
      .maybeSingle();
    const prevUsValue = Number(
      (prevReport as { us_portfolio_value?: number | null } | null)?.us_portfolio_value ??
        usPortfolio?.starting_cash ??
        usValue
    );
    const prevTwValue = Number(
      (prevReport as { tw_portfolio_value?: number | null } | null)?.tw_portfolio_value ??
        twPortfolio?.starting_cash ??
        twValue
    );
    const model = modelForDivision(division);
    const prompt = buildReportPrompt({
      division,
      date: reportDate,
      trades,
      positions,
      usCash: Number(usPortfolio?.current_cash ?? 0),
      twCash: Number(twPortfolio?.current_cash ?? 0),
      usValue,
      twValue
    });
    const startedAt = new Date().toISOString();
    const result = await callModel({
      provider: model.provider,
      model: model.model,
      prompt,
      budget: { userId }
    });
    const validation = await validateOrRepair({
      rawText: result.text,
      schema: ReportSchema,
      schemaDescription: "simulation daily report",
      provider: model.provider,
      model: model.provider === "OpenAI" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001",
      budget: { userId }
    });
    const report = validation.parsed;

    await supabase.from("stocks_sim_daily_reports").upsert(
      {
        user_id: userId,
        division,
        report_date: reportDate,
        us_portfolio_value: usValue,
        tw_portfolio_value: twValue,
        us_day_pnl: usPortfolio ? usValue - prevUsValue : null,
        tw_day_pnl: twPortfolio ? twValue - prevTwValue : null,
        us_day_pnl_pct:
          usPortfolio && prevUsValue > 0 ? ((usValue - prevUsValue) / prevUsValue) * 100 : null,
        tw_day_pnl_pct:
          twPortfolio && prevTwValue > 0 ? ((twValue - prevTwValue) / prevTwValue) * 100 : null,
        trades_summary: report.trades_summary,
        positions_review: report.positions_review,
        market_commentary: report.market_commentary,
        tomorrow_outlook: report.tomorrow_outlook,
        planned_actions: report.planned_actions ?? null,
        trades_today: trades,
        positions_snapshot: positions
      },
      { onConflict: "user_id,division,report_date" }
    );

    const predictions = await extractPredictions({
      division,
      reportDate,
      tomorrowOutlook: report.tomorrow_outlook,
      plannedActions: report.planned_actions ?? null
    });
    await saveExtractedPredictions({ supabase, userId, division, reportDate, predictions });
    await supabase.from("stocks_agent_runs").insert({
      user_id: userId,
      status: "completed",
      model_provider: model.provider,
      model_name: model.model,
      prompt_key: "sim_daily_report",
      prompt_version: "1",
      input_summary: inputSummary(prompt),
      output: report,
      token_count: result.tokenCount + validation.tokenCount,
      prompt_tokens: result.promptTokens + validation.promptTokens,
      completion_tokens: result.completionTokens + validation.completionTokens,
      estimated_cost_usd: result.estimatedCostUsd + validation.estimatedCostUsd,
      started_at: startedAt,
      completed_at: new Date().toISOString()
    });
    messages.push(`${division} 日報完成`);
  }

  return messages.join("，");
}
