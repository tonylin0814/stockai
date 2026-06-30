import { z } from "zod";
import { buildTradingDecisionPrompt } from "@/lib/analysis/prompts/sim-trading";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { Quote } from "@/lib/market-data/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Division = "gpt" | "anthropic";
type Market = "US" | "TW";
type Portfolio = {
  id: string;
  user_id: string;
  division: Division;
  market: Market;
  starting_cash: number;
  current_cash: number;
};
type Position = {
  id: string;
  portfolio_id: string;
  symbol: string;
  market: Market;
  name: string;
  shares: number;
  avg_cost_price: number;
  current_price: number | null;
  stop_flagged: boolean;
};

function normalizeMarket(value: unknown): Market {
  if (typeof value !== "string") return "US";
  const text = value.toUpperCase().trim();
  if (
    text === "TW" ||
    text.includes("TW") ||
    text.includes("台") ||
    text.includes("TAIWAN") ||
    text.includes("TAIEX") ||
    text.includes("TWSE")
  ) {
    return "TW";
  }
  return "US";
}

const TradeDecisionSchema = z.object({
  action: z.enum(["buy", "sell", "hold"]),
  symbol: z.string(),
  market: z.preprocess((value) => normalizeMarket(value), z.enum(["US", "TW"]).catch("US")),
  name: z.string().optional(),
  shares: z.coerce.number().optional(),
  thesis: z.string().optional(),
  technicalBasis: z.string().optional(),
  fundamentalBasis: z.string().optional().nullable(),
  riskFactors: z.string().optional(),
  targetPrice: z.coerce.number().optional().nullable(),
  stopLoss: z.coerce.number().optional().nullable(),
  conviction: z.coerce.number().optional().nullable()
});

const TradingResponseSchema = z.object({
  decisions: z.array(TradeDecisionSchema).default([]),
  noActionReason: z.string().optional(),
  marketAssessment: z.string().optional()
});

type TradeDecision = z.infer<typeof TradeDecisionSchema>;

const divisions: Division[] = ["gpt", "anthropic"];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function modelForDivision(division: Division) {
  if (division === "anthropic") {
    return { provider: "Anthropic", model: "claude-haiku-4-5-20251001" };
  }
  return { provider: "OpenAI", model: "gpt-4o" };
}

function isWithinTradingHours(config: Record<string, unknown>, market: Market) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const hour = now.getHours();
  const startHour = Number(config[market === "US" ? "us_start_hour" : "tw_start_hour"] ?? 0);
  const endHour = Number(config[market === "US" ? "us_end_hour" : "tw_end_hour"] ?? 24);
  return hour >= startHour && hour < endHour;
}

async function ensureConfig(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string
) {
  const { data: existing } = await supabase
    .from("sim_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing as Record<string, unknown>;

  const { data, error } = await supabase
    .from("sim_config")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "無法建立模擬交易設定。");
  return data as Record<string, unknown>;
}

async function ensurePortfolio(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  division: Division,
  market: Market
) {
  const startingCash = market === "US" ? 10000 : 300000;
  const { data: existing } = await supabase
    .from("sim_portfolios")
    .select("*")
    .eq("user_id", userId)
    .eq("division", division)
    .eq("market", market)
    .maybeSingle();

  if (existing) return existing as Portfolio;

  const { data, error } = await supabase
    .from("sim_portfolios")
    .insert({
      user_id: userId,
      division,
      market,
      starting_cash: startingCash,
      current_cash: startingCash
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "無法建立模擬投資組合。");
  return data as Portfolio;
}

async function loadCandidates(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  market: Market
) {
  const fallback =
    market === "US"
      ? [
          { symbol: "NVDA", name: "NVIDIA Corp." },
          { symbol: "AAPL", name: "Apple Inc." },
          { symbol: "MSFT", name: "Microsoft Corp." }
        ]
      : [
          { symbol: "2330", name: "台積電" },
          { symbol: "2454", name: "聯發科" },
          { symbol: "2409", name: "友達" }
        ];

  const [{ data: holdings }, { data: watchlist }] = await Promise.all([
    supabase
      .from("portfolio_holdings")
      .select("securities(symbol, market, name)")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("watchlist_items")
      .select("securities(symbol, market, name)")
      .eq("user_id", userId)
  ]);

  const rows = [...(holdings ?? []), ...(watchlist ?? [])]
    .map((row: Record<string, unknown>) => row.securities as Record<string, unknown> | null)
    .filter((security): security is Record<string, unknown> => Boolean(security))
    .filter((security) => security.market === market)
    .map((security) => ({
      symbol: String(security.symbol),
      name: String(security.name ?? security.symbol)
    }));

  const seen = new Set<string>();
  return [...rows, ...fallback]
    .filter((candidate) => {
      const key = candidate.symbol.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

async function quoteWithTechnicals(symbol: string, name: string, market: Market) {
  const provider = getMarketDataProvider();
  const quote = await provider.getQuote(symbol, market);
  const history = await provider.getHistory(symbol, market, 90).catch(() => []);
  const closes = history.map((row) => row.close).filter((value) => Number.isFinite(value));
  const sma = (days: number) =>
    closes.length >= days
      ? closes.slice(-days).reduce((sum, value) => sum + value, 0) / days
      : null;
  return {
    symbol,
    name,
    quote,
    sma20: sma(20),
    sma60: sma(60),
    rsi14: null
  };
}

async function hasSameDayConflict(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  portfolioId: string,
  symbol: string,
  intendedAction: "buy" | "sell",
  sessionDate: string
) {
  const { data } = await supabase
    .from("sim_trades")
    .select("action")
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .eq("session_date", sessionDate);
  const oppositeAction = intendedAction === "buy" ? "sell" : "buy";
  return (data ?? []).some((trade: { action: string }) => trade.action === oppositeAction);
}

async function executeTrade(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  portfolio: Portfolio;
  positions: Position[];
  decision: TradeDecision;
  quote: Quote;
  sessionDate: string;
  maxPositionPct: number;
  aiModel: string;
}) {
  const decision = params.decision;
  if (decision.action === "hold") return false;
  if (decision.market !== params.portfolio.market) return false;
  if (params.quote.qualityState === "missing" || params.quote.price <= 0) return false;
  const shares = Math.floor(Number(decision.shares ?? 0));
  if (shares <= 0) return false;
  if (
    await hasSameDayConflict(
      params.supabase,
      params.portfolio.id,
      decision.symbol,
      decision.action,
      params.sessionDate
    )
  ) {
    return false;
  }

  const existing = params.positions.find((position) => position.symbol === decision.symbol);
  const totalAmount = shares * params.quote.price;

  if (decision.action === "buy") {
    const openCount = params.positions.length;
    if (!existing && openCount >= 3) return false;
    if (totalAmount > Number(params.portfolio.current_cash)) return false;
    if (totalAmount > Number(params.portfolio.starting_cash) * params.maxPositionPct) return false;

    let positionId = existing?.id;
    if (existing) {
      const newShares = Number(existing.shares) + shares;
      const newAvgCost =
        (Number(existing.shares) * Number(existing.avg_cost_price) + totalAmount) / newShares;
      await params.supabase
        .from("sim_positions")
        .update({ shares: newShares, avg_cost_price: newAvgCost, current_price: params.quote.price })
        .eq("id", existing.id);
    } else {
      const { data: created, error } = await params.supabase
        .from("sim_positions")
        .insert({
          portfolio_id: params.portfolio.id,
          symbol: decision.symbol,
          market: decision.market,
          name: decision.name ?? decision.symbol,
          shares,
          avg_cost_price: params.quote.price,
          current_price: params.quote.price
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "建立模擬持倉失敗。");
      positionId = (created as { id: string }).id;
    }

    await params.supabase
      .from("sim_portfolios")
      .update({ current_cash: Number(params.portfolio.current_cash) - totalAmount })
      .eq("id", params.portfolio.id);

    await params.supabase.from("sim_trades").insert({
      portfolio_id: params.portfolio.id,
      position_id: positionId,
      action: "buy",
      symbol: decision.symbol,
      market: decision.market,
      name: decision.name ?? decision.symbol,
      shares,
      price_per_share: params.quote.price,
      total_amount: totalAmount,
      thesis: decision.thesis ?? "模型未提供詳細投資論點。",
      technical_basis: decision.technicalBasis ?? "模型未提供技術依據。",
      fundamental_basis: decision.fundamentalBasis ?? null,
      risk_factors: decision.riskFactors ?? "模型未提供風險說明。",
      target_price: decision.targetPrice ?? null,
      stop_loss: decision.stopLoss ?? null,
      conviction: decision.conviction ?? null,
      session_date: params.sessionDate,
      ai_model: params.aiModel
    });
    return true;
  }

  if (!existing) return false;
  const sharesToSell = Math.min(shares, Number(existing.shares));
  const proceeds = sharesToSell * params.quote.price;
  const costBasis = sharesToSell * Number(existing.avg_cost_price);
  const pnl = proceeds - costBasis;
  const pnlPct = costBasis > 0 ? pnl / costBasis : 0;

  if (sharesToSell >= Number(existing.shares)) {
    await params.supabase
      .from("sim_positions")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        current_price: params.quote.price
      })
      .eq("id", existing.id);
  } else {
    await params.supabase
      .from("sim_positions")
      .update({ shares: Number(existing.shares) - sharesToSell, current_price: params.quote.price })
      .eq("id", existing.id);
  }

  await params.supabase
    .from("sim_portfolios")
    .update({ current_cash: Number(params.portfolio.current_cash) + proceeds })
    .eq("id", params.portfolio.id);

  await params.supabase.from("sim_trades").insert({
    portfolio_id: params.portfolio.id,
    position_id: existing.id,
    action: "sell",
    symbol: decision.symbol,
    market: decision.market,
    name: existing.name,
    shares: sharesToSell,
    price_per_share: params.quote.price,
    total_amount: proceeds,
    thesis: decision.thesis ?? "模型未提供賣出論點。",
    technical_basis: decision.technicalBasis ?? "模型未提供技術依據。",
    fundamental_basis: decision.fundamentalBasis ?? null,
    risk_factors: decision.riskFactors ?? "模型未提供風險說明。",
    conviction: decision.conviction ?? null,
    outcome_pnl: pnl,
    outcome_pct: pnlPct,
    session_date: params.sessionDate,
    ai_model: params.aiModel
  });
  return true;
}

export async function runTradeForUser(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  market: Market,
  opts: { bypassHoursCheck?: boolean } = {}
) {
  const sessionDate = todayIsoDate();
  const config = await ensureConfig(supabase, userId);
  const summary: string[] = [];

  for (const division of divisions) {
    if (!opts.bypassHoursCheck && !isWithinTradingHours(config, market)) {
      summary.push(`${division}/${market} 不在交易時段。`);
      continue;
    }

    const portfolio = await ensurePortfolio(supabase, userId, division, market);
    const { data: existingSession } = await supabase
      .from("sim_trades")
      .select("id")
      .eq("portfolio_id", portfolio.id)
      .eq("session_date", sessionDate)
      .limit(1);
    if ((existingSession ?? []).length) {
      summary.push(`${division}/${market} 今日已執行過。`);
      continue;
    }

    const { data: positionsData } = await supabase
      .from("sim_positions")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .eq("status", "open");
    const positions = (positionsData ?? []) as Position[];
    const candidates = await loadCandidates(supabase, userId, market);
    const candidateQuotes = await Promise.all(
      candidates.map((candidate) => quoteWithTechnicals(candidate.symbol, candidate.name, market))
    );
    const openPositionQuotes = await Promise.all(
      positions.map((position) => quoteWithTechnicals(position.symbol, position.name, market))
    );
    const indexQuote =
      market === "US"
        ? await getMarketDataProvider().getIndex("^GSPC", "US")
        : await getMarketDataProvider().getIndex("^TWII", "TW");
    const vixQuote =
      market === "US" ? await getMarketDataProvider().getIndex("^VIX", "US").catch(() => null) : null;

    const prompt = buildTradingDecisionPrompt(division, market, {
      startingBudget: Number(portfolio.starting_cash),
      availableCash: Number(portfolio.current_cash),
      openPositions: openPositionQuotes.map((item) => {
        const position = positions.find((row) => row.symbol === item.symbol)!;
        return {
          symbol: position.symbol,
          name: position.name,
          shares: Number(position.shares),
          avgCost: Number(position.avg_cost_price),
          currentPrice: item.quote.price,
          stopFlagged: Boolean(position.stop_flagged),
          sma20: item.sma20,
          sma60: item.sma60,
          rsi14: item.rsi14
        };
      }),
      todayTrades: [],
      candidates: candidateQuotes
        .filter((item) => item.quote.qualityState !== "missing" && item.quote.price > 0)
        .map((item) => ({
          symbol: item.symbol,
          name: item.name,
          price: item.quote.price,
          changePct: item.quote.changePct,
          sma20: item.sma20,
          sma60: item.sma60,
          rsi14: item.rsi14
        })),
      indexPrice: indexQuote.price,
      indexChangePct: indexQuote.changePct,
      vix: vixQuote?.price ?? null
    });
    const model = modelForDivision(division);
    const startedAt = new Date().toISOString();
    const result = await callModel({
      provider: model.provider,
      model: model.model,
      prompt,
      budget: { userId }
    });
    const validation = await validateOrRepair({
      rawText: result.text,
      schema: TradingResponseSchema,
      schemaDescription: "AI paper trading decisions",
      provider: model.provider,
      model: model.provider === "OpenAI" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001",
      budget: { userId }
    });
    const parsed = validation.parsed;
    const quoteMap = new Map(candidateQuotes.map((item) => [item.symbol, item.quote]));
    openPositionQuotes.forEach((item) => quoteMap.set(item.symbol, item.quote));
    let executed = 0;

    for (const decision of parsed.decisions) {
      const normalizedDecision = { ...decision, market };
      const quote = quoteMap.get(normalizedDecision.symbol);
      if (!quote) continue;
      const ok = await executeTrade({
        supabase,
        portfolio,
        positions,
        decision: normalizedDecision,
        quote,
        sessionDate,
        maxPositionPct: Number(config.max_position_pct ?? 0.4),
        aiModel: model.model
      });
      if (ok) executed += 1;
    }

    await supabase.from("agent_runs").insert({
      user_id: userId,
      status: "completed",
      model_provider: model.provider,
      model_name: model.model,
      prompt_key: "sim_trading",
      prompt_version: "1",
      input_summary: inputSummary(prompt),
      output: parsed,
      confidence: null,
      token_count: result.tokenCount + validation.tokenCount,
      prompt_tokens: result.promptTokens + validation.promptTokens,
      completion_tokens: result.completionTokens + validation.completionTokens,
      estimated_cost_usd: result.estimatedCostUsd + validation.estimatedCostUsd,
      started_at: startedAt,
      completed_at: new Date().toISOString()
    });
    summary.push(`${division}/${market} 完成，執行 ${executed} 筆交易。`);
  }

  return summary.join(" ");
}
