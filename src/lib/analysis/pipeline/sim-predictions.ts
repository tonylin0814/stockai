import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketDataProvider } from "@/lib/market-data/types";

export type ExtractedPrediction = {
  condition_text: string;
  condition_type: "price_trigger" | "action_follow_through" | "market_direction" | null;
  symbol: string | null;
  market?: "US" | "TW" | null;
  trigger_price: number | null;
  trigger_direction: "above" | "below" | null;
  predicted_action: "buy" | "sell" | "hold" | "market_up" | "market_down" | null;
};

function nextDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export async function extractPredictions(params: {
  division: "gpt" | "anthropic";
  reportDate: string;
  tomorrowOutlook: string;
  plannedActions: string | null;
}): Promise<ExtractedPrediction[]> {
  if (!process.env.OPENAI_API_KEY) return [];

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `從以下投資日報的「明日展望」和「明日計劃」中，提取所有可在明日驗證的具體預測或行動計劃。

明日展望：
${params.tomorrowOutlook}

明日計劃：
${params.plannedActions ?? "（無）"}

輸出 JSON：
{
  "predictions": [
    {
      "condition_text": "原文描述",
      "condition_type": "price_trigger" | "action_follow_through" | "market_direction",
      "symbol": "代號或null",
      "market": "US" | "TW" | null,
      "trigger_price": 數字或null,
      "trigger_direction": "above" | "below" | null,
      "predicted_action": "buy" | "sell" | "hold" | "market_up" | "market_down"
    }
  ]
}

只提取有明確條件的預測，不提取模糊陳述。`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: 1200
    });
    const json = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      predictions?: ExtractedPrediction[];
    };
    return Array.isArray(json.predictions) ? json.predictions : [];
  } catch {
    return [];
  }
}

export async function saveExtractedPredictions(params: {
  supabase: SupabaseClient;
  userId: string;
  division: "gpt" | "anthropic";
  reportDate: string;
  predictions: ExtractedPrediction[];
}) {
  const rows = params.predictions
    .filter((prediction) => prediction.condition_text)
    .map((prediction) => ({
      user_id: params.userId,
      division: params.division,
      report_date: params.reportDate,
      verify_date: nextDay(params.reportDate),
      condition_text: prediction.condition_text,
      condition_type: prediction.condition_type,
      symbol: prediction.symbol,
      market: prediction.market ?? "US",
      trigger_price: prediction.trigger_price,
      trigger_direction: prediction.trigger_direction,
      predicted_action: prediction.predicted_action
    }));

  if (rows.length) {
    await params.supabase.from("sim_predictions").insert(rows);
  }
}

export async function verifyPredictions(params: {
  supabase: SupabaseClient;
  userId: string;
  division: "gpt" | "anthropic";
  verifyDate: string;
  provider: MarketDataProvider;
}) {
  const { data: pending } = await params.supabase
    .from("sim_predictions")
    .select("*")
    .eq("user_id", params.userId)
    .eq("division", params.division)
    .eq("verify_date", params.verifyDate)
    .is("verified_at", null);

  const { data: portfolios } = await params.supabase
    .from("sim_portfolios")
    .select("id")
    .eq("user_id", params.userId)
    .eq("division", params.division);
  const portfolioIds = (portfolios ?? []).map((row: { id: string }) => row.id);

  for (const prediction of (pending ?? []) as Array<Record<string, unknown>>) {
    let conditionMet = false;
    let actionTaken = false;
    const symbol = String(prediction.symbol ?? "");
    const triggerPrice = Number(prediction.trigger_price);
    const market = prediction.market === "TW" ? "TW" : "US";

    if (prediction.condition_type === "price_trigger" && symbol && Number.isFinite(triggerPrice)) {
      const quote = await params.provider.getQuote(symbol, market);
      if (prediction.trigger_direction === "below") {
        conditionMet = quote.price < triggerPrice;
      } else if (prediction.trigger_direction === "above") {
        conditionMet = quote.price > triggerPrice;
      }
    }

    if (conditionMet && portfolioIds.length) {
      const { data: trades } = await params.supabase
        .from("sim_trades")
        .select("action")
        .eq("session_date", params.verifyDate)
        .eq("symbol", symbol)
        .in("portfolio_id", portfolioIds);
      actionTaken = (trades ?? []).some(
        (trade: { action: string }) => trade.action === prediction.predicted_action
      );
    }

    await params.supabase
      .from("sim_predictions")
      .update({
        condition_met: conditionMet,
        action_taken: actionTaken,
        score_awarded: conditionMet && actionTaken,
        verified_at: new Date().toISOString()
      })
      .eq("id", prediction.id);
  }
}
