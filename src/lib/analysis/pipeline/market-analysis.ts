import { z } from "zod";
import {
  TW_ETF_UNIVERSE,
  TW_UNIVERSE_100_TO_200,
  TW_UNIVERSE_50_TO_100,
  TW_UNIVERSE_UNDER_50
} from "@/lib/analysis/tw-universe";
import {
  US_ETF_UNIVERSE,
  US_UNIVERSE_100_TO_200,
  US_UNIVERSE_50_TO_100,
  US_UNIVERSE_UNDER_50
} from "@/lib/analysis/us-universe";
import {
  buildMarketAnalysisPrompt,
  type EnrichedCandidate
} from "@/lib/analysis/prompts/market-analysis";
import { inputSummary, callModel, validateOrRepair } from "@/lib/analysis/pipeline/model";
import { savePipelineAgentRun } from "@/lib/analysis/pipeline/db";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import { computeTechnicals } from "@/lib/market-data/indicators";

export type ScanPick = {
  symbol: string;
  name: string;
  market: "TW" | "US";
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

export type MarketAnalysisResult = {
  market: "TW" | "US";
  sentiment: "bull" | "bear" | "neutral";
  sentimentReason: string;
  picksUnder50: ScanPick[];
  picksUnder100: ScanPick[];
  picksUnder200: ScanPick[];
  etfPicks: ScanPick[];
  runDate: string;
};

const ScanPickSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  market: z.enum(["TW", "US"]),
  signal: z.enum(["bull", "bear", "neutral"]).default("neutral"),
  currentPrice: z.coerce.number(),
  entryPoint: z.coerce.number(),
  targetPrice: z.coerce.number(),
  stopLoss: z.coerce.number(),
  upsidePct: z.coerce.number(),
  confidence: z.coerce.number().min(0).max(100),
  reason: z.string(),
  volumeAlert: z.boolean().default(false)
});

const MarketAnalysisResultSchema = z.object({
  sentiment: z.enum(["bull", "bear", "neutral"]).default("neutral"),
  sentimentReason: z.string().default(""),
  picksUnder50: z.array(ScanPickSchema).default([]),
  picksUnder100: z.array(ScanPickSchema).default([]),
  picksUnder200: z.array(ScanPickSchema).default([]),
  etfPicks: z.array(ScanPickSchema).default([])
});

function averageClose(history: Array<{ close: number }>, period: number) {
  const closes = history.map((day) => day.close).filter((close) => close > 0);

  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  return Math.round((slice.reduce((sum, close) => sum + close, 0) / period) * 100) / 100;
}

function clampPick(
  pick: ScanPick,
  market: "TW" | "US",
  candidates: EnrichedCandidate[]
): ScanPick | null {
  const source = candidates.find((candidate) => candidate.symbol === pick.symbol);

  if (!source || pick.market !== market) {
    return null;
  }

  const target = Number.isFinite(pick.targetPrice) ? pick.targetPrice : source.price;
  const upsidePct = source.price > 0 ? ((target - source.price) / source.price) * 100 : 0;

  return {
    ...pick,
    name: source.name,
    currentPrice: source.price,
    targetPrice: target,
    upsidePct: Math.round(upsidePct * 10) / 10,
    confidence: Math.max(50, Math.min(85, Math.round(pick.confidence))),
    volumeAlert: source.volumeAlert && pick.volumeAlert
  };
}

function clampPicks(
  picks: ScanPick[],
  market: "TW" | "US",
  candidates: EnrichedCandidate[]
) {
  return picks
    .map((pick) => clampPick(pick, market, candidates))
    .filter((pick): pick is ScanPick => Boolean(pick))
    .slice(0, 3);
}

export async function runMarketAnalysis(params: {
  market: "TW" | "US";
  excludeSymbols: Set<string>;
  marketSnapshot: { indexPrice: number; indexChangePct: number; vix: number };
  userId: string;
  dailyRunId: string;
}): Promise<MarketAnalysisResult> {
  const provider = getMarketDataProvider();
  const under50List = params.market === "TW" ? TW_UNIVERSE_UNDER_50 : US_UNIVERSE_UNDER_50;
  const under100List =
    params.market === "TW" ? TW_UNIVERSE_50_TO_100 : US_UNIVERSE_50_TO_100;
  const under200List =
    params.market === "TW" ? TW_UNIVERSE_100_TO_200 : US_UNIVERSE_100_TO_200;
  const etfList = params.market === "TW" ? TW_ETF_UNIVERSE : US_ETF_UNIVERSE;
  const etfSymbols = new Set(etfList.map((item) => item.symbol));
  const allCandidates = [...under50List, ...under100List, ...under200List, ...etfList].filter(
    (candidate, index, array) =>
      !params.excludeSymbols.has(candidate.symbol) &&
      array.findIndex((item) => item.symbol === candidate.symbol) === index
  );
  const [quotes, histories] = await Promise.all([
    Promise.all(
      allCandidates.map((candidate) =>
        provider.getQuote(candidate.symbol, params.market).catch(() => null)
      )
    ),
    Promise.all(
      allCandidates.map((candidate) =>
        provider.getHistory(candidate.symbol, params.market, 252).catch(() => [])
      )
    )
  ]);
  const enriched: EnrichedCandidate[] = allCandidates.flatMap((candidate, index) => {
    const quote = quotes[index];

    if (!quote || quote.qualityState === "missing" || quote.price === 0) {
      return [];
    }

    const history = histories[index] ?? [];
    const technicals = computeTechnicals(history);
    const avgVolume = technicals.avgVolume20d;
    const todayVolume = quote.volume ?? null;

    return [
      {
        symbol: candidate.symbol,
        name: candidate.name,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: todayVolume,
        avgVolume,
        sma20: technicals.sma20,
        sma60: averageClose(history, 60),
        rsi14: technicals.rsi14,
        weekHigh52: technicals.high52w,
        weekLow52: technicals.low52w,
        volumeAlert: Boolean(todayVolume && avgVolume && todayVolume > avgVolume * 1.5)
      }
    ];
  });
  const nonEtfs = enriched.filter((candidate) => !etfSymbols.has(candidate.symbol));
  const tiers = {
    tier50: nonEtfs.filter((candidate) => candidate.price < 50),
    tier100: nonEtfs.filter((candidate) => candidate.price >= 50 && candidate.price < 100),
    tier200: nonEtfs.filter((candidate) => candidate.price >= 100 && candidate.price < 200),
    etfs: enriched.filter((candidate) => etfSymbols.has(candidate.symbol))
  };
  const prompt = buildMarketAnalysisPrompt(
    params.market,
    params.market === "TW" ? "NT$" : "US$",
    params.marketSnapshot,
    tiers
  );
  const model = process.env.MARKET_ANALYSIS_MODEL ?? "gpt-4o";
  const startedAt = new Date().toISOString();
  const modelResult = await callModel({
    provider: "OpenAI",
    model,
    prompt,
    budget: { userId: params.userId, dailyRunId: params.dailyRunId }
  });
  const repaired = await validateOrRepair({
    rawText: modelResult.text,
    schema: MarketAnalysisResultSchema,
    schemaDescription: "Market analysis result JSON",
    provider: "OpenAI",
    model,
    budget: { userId: params.userId, dailyRunId: params.dailyRunId }
  });
  const parsed = repaired.parsed;
  const result: MarketAnalysisResult = {
    market: params.market,
    sentiment: parsed.sentiment,
    sentimentReason: parsed.sentimentReason,
    picksUnder50: clampPicks(parsed.picksUnder50, params.market, tiers.tier50),
    picksUnder100: clampPicks(parsed.picksUnder100, params.market, tiers.tier100),
    picksUnder200: clampPicks(parsed.picksUnder200, params.market, tiers.tier200),
    etfPicks: clampPicks(parsed.etfPicks, params.market, tiers.etfs),
    runDate: new Date().toISOString()
  };

  await savePipelineAgentRun({
    userId: params.userId,
    dailyRunId: params.dailyRunId,
    provider: "OpenAI",
    model,
    promptKey: "marketAnalysis",
    inputSummary: inputSummary(prompt),
    output: result,
    confidence: null,
    tokenCount: modelResult.tokenCount + repaired.tokenCount,
    promptTokens: modelResult.promptTokens + repaired.promptTokens,
    completionTokens: modelResult.completionTokens + repaired.completionTokens,
    estimatedCostUsd: modelResult.estimatedCostUsd + repaired.estimatedCostUsd,
    startedAt,
    completedAt: new Date().toISOString(),
    status: "completed"
  });

  return result;
}
