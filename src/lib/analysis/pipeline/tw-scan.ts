import { z } from "zod";
import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { buildTwScanPrompt } from "@/lib/analysis/prompts/tw-scan";
import { inputSummary, callModel, validateOrRepair } from "@/lib/analysis/pipeline/model";
import { savePipelineAgentRun } from "@/lib/analysis/pipeline/db";
import {
  MarketScanRecommendationSchema,
  type TwScanPick
} from "@/lib/analysis/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const TwScanResultSchema = z.object({
  scanSummary: z.string(),
  picks: z.array(MarketScanRecommendationSchema).default([])
});

export type TwScanResult = {
  scanSummary: string;
  picks: TwScanPick[];
};

function parseFirstNumber(value: string) {
  const match = value.replace(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function clampPickToInput(pick: TwScanPick, dataPackage: DailyDataPackage): TwScanPick | null {
  const source = dataPackage.twScanUniverse.find((item) => item.symbol === pick.symbol);

  if (!source || pick.market !== "TW") {
    return null;
  }

  return {
    ...pick,
    name: source.name,
    currentPrice: source.price,
    confidence: Math.max(50, Math.min(85, pick.confidence))
  };
}

export async function runTaiwanScan(params: {
  dataPackage: DailyDataPackage;
  userId: string;
  dailyRunId: string;
}): Promise<TwScanResult> {
  if (params.dataPackage.twScanUniverse.length === 0) {
    return {
      scanSummary: "所有台股掃描標的已在持股或關注清單中。",
      picks: []
    };
  }

  const prompt = buildTwScanPrompt(params.dataPackage.twScanUniverse, {
    taiexPrice: params.dataPackage.marketSnapshot.taiex.price,
    taiexChangePct: params.dataPackage.marketSnapshot.taiex.changePct,
    vix: params.dataPackage.marketSnapshot.vix.price
  });
  const model = process.env.CODEX_MODEL_NAME ?? "codex-local";
  const startedAt = new Date().toISOString();

  try {
    const result = await callModel({
      provider: "Codex",
      model,
      prompt,
      budget: {
        userId: params.userId,
        dailyRunId: params.dailyRunId
      }
    });
    const repaired = await validateOrRepair({
      rawText: result.text,
      schema: TwScanResultSchema,
      schemaDescription: "Taiwan scan result JSON",
      provider: "Codex",
      model,
      budget: {
        userId: params.userId,
        dailyRunId: params.dailyRunId
      }
    });
    const parsed = repaired.parsed;
    const picks = parsed.picks
      .map((pick) => clampPickToInput(pick, params.dataPackage))
      .filter((pick): pick is TwScanPick => Boolean(pick))
      .slice(0, 5);
    const completedAt = new Date().toISOString();

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      provider: "Codex",
      model,
      promptKey: "twScan",
      inputSummary: inputSummary(prompt),
      output: { scanSummary: parsed.scanSummary, picks },
      confidence: picks.length
        ? Math.round(picks.reduce((sum, pick) => sum + pick.confidence, 0) / picks.length)
        : null,
      tokenCount: result.tokenCount + repaired.tokenCount,
      promptTokens: result.promptTokens + repaired.promptTokens,
      completionTokens: result.completionTokens + repaired.completionTokens,
      estimatedCostUsd: result.estimatedCostUsd + repaired.estimatedCostUsd,
      startedAt,
      completedAt,
      status: "completed"
    });

    if (picks.length > 0) {
      const supabase = createSupabaseServiceClient();
      await supabase.from("stocks_securities").upsert(
        picks.map((pick) => ({
          symbol: pick.symbol,
          market: pick.market,
          name: pick.name,
          security_type: "stock",
          currency: "TWD"
        })),
        { onConflict: "symbol,market" }
      );

      const { error } = await supabase.from("stocks_daily_scan_picks").insert(
        picks.map((pick) => ({
          user_id: params.userId,
          daily_run_id: params.dailyRunId,
          symbol: pick.symbol,
          market: pick.market,
          name: pick.name,
          signal: pick.signal,
          current_price: pick.currentPrice,
          target_price: parseFirstNumber(pick.targetPrice),
          stop_loss: parseFirstNumber(pick.stopLoss),
          upside_pct: pick.upsidePct,
          time_horizon: pick.timeHorizon,
          confidence: pick.confidence,
          reason: pick.reason,
          key_risks: pick.keyRisks,
          scan_summary: parsed.scanSummary
        }))
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    return { scanSummary: parsed.scanSummary, picks };
  } catch (error) {
    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: params.dailyRunId,
      provider: "Codex",
      model,
      promptKey: "twScan",
      inputSummary: inputSummary(prompt),
      output: null,
      confidence: null,
      tokenCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "台股掃描失敗。"
    });

    return {
      scanSummary: "台股掃描暫時失敗，請稍後重新執行每日分析。",
      picks: []
    };
  }
}
