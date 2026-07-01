import { getMarketDataProvider } from "@/lib/market-data/provider";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const BUY_ACTIONS = new Set(["buy", "small_buy", "add"]);
const SELL_ACTIONS = new Set(["sell", "reduce", "avoid"]);

type OpenRecommendation = {
  id: string;
  action: string;
  buy_zone_low: number | null;
  buy_zone_high: number | null;
  target_price: number | null;
  stop_loss: number | null;
  securities: { symbol: string; market: string; name: string } | null;
};

export type Alert = {
  id: string;
  alert_type: string;
  symbol: string | null;
  market: string | null;
  message: string;
  current_price: number | null;
  threshold_price: number | null;
  is_read: boolean;
  created_at: string;
};

function isMarket(value: string): value is "US" | "TW" {
  return value === "US" || value === "TW";
}

function alertKey(alert: { recommendation_id: string | null; alert_type: string }) {
  return `${alert.recommendation_id ?? "global"}:${alert.alert_type}`;
}

export async function refreshAndGetAlerts(userId: string): Promise<Alert[]> {
  const supabase = createSupabaseServiceClient();
  const provider = getMarketDataProvider();
  const today = new Date().toISOString().slice(0, 10);

  const { data: recs } = await supabase
    .from("stocks_recommendations")
    .select("id, action, buy_zone_low, buy_zone_high, target_price, stop_loss, securities:stocks_securities(symbol, market, name)")
    .eq("user_id", userId)
    .eq("status", "open");
  const openRecs = ((recs ?? []) as unknown as OpenRecommendation[]).filter(
    (recommendation) => recommendation.securities?.symbol
  );
  const { data: existing } = await supabase
    .from("stocks_alerts")
    .select("recommendation_id, alert_type")
    .eq("user_id", userId)
    .eq("alert_date", today);
  const alreadyAlerted = new Set(
    ((existing ?? []) as Array<{ recommendation_id: string | null; alert_type: string }>).map(
      alertKey
    )
  );

  for (const rec of openRecs) {
    const security = rec.securities!;
    const { symbol, market } = security;

    if (!isMarket(market)) continue;

    let currentPrice: number | null = null;
    try {
      const quote = await provider.getQuote(symbol, market);
      currentPrice = quote.price ?? null;
    } catch {
      continue;
    }

    if (currentPrice === null) continue;

    const action = rec.action.trim().toLowerCase();
    const newAlerts: Array<{
      alert_type: "price_in_buy_zone" | "target_hit" | "stop_loss_hit";
      message: string;
      threshold_price: number | null;
    }> = [];

    if (
      rec.buy_zone_low !== null &&
      rec.buy_zone_high !== null &&
      currentPrice >= rec.buy_zone_low &&
      currentPrice <= rec.buy_zone_high
    ) {
      newAlerts.push({
        alert_type: "price_in_buy_zone",
        message: `${symbol} 現價 ${currentPrice} 已進入買入區間 ${rec.buy_zone_low}-${rec.buy_zone_high}`,
        threshold_price: rec.buy_zone_high
      });
    }

    if (rec.target_price !== null) {
      const targetHit = BUY_ACTIONS.has(action)
        ? currentPrice >= rec.target_price
        : SELL_ACTIONS.has(action)
          ? currentPrice <= rec.target_price
          : false;

      if (targetHit) {
        newAlerts.push({
          alert_type: "target_hit",
          message: `${symbol} 已達目標價 ${rec.target_price}（現價 ${currentPrice}）`,
          threshold_price: rec.target_price
        });
      }
    }

    if (rec.stop_loss !== null) {
      const stopHit = BUY_ACTIONS.has(action)
        ? currentPrice <= rec.stop_loss
        : SELL_ACTIONS.has(action)
          ? currentPrice >= rec.stop_loss
          : false;

      if (stopHit) {
        newAlerts.push({
          alert_type: "stop_loss_hit",
          message: `${symbol} 已觸及停損價 ${rec.stop_loss}（現價 ${currentPrice}）`,
          threshold_price: rec.stop_loss
        });
      }
    }

    for (const alert of newAlerts) {
      const key = alertKey({ recommendation_id: rec.id, alert_type: alert.alert_type });
      if (alreadyAlerted.has(key)) continue;

      await supabase.from("stocks_alerts").insert({
        user_id: userId,
        recommendation_id: rec.id,
        alert_type: alert.alert_type,
        symbol,
        market,
        message: alert.message,
        current_price: currentPrice,
        threshold_price: alert.threshold_price,
        alert_date: today
      });
      alreadyAlerted.add(key);
    }
  }

  const { data: recentRun } = await supabase
    .from("stocks_daily_runs")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const staleKey = alertKey({ recommendation_id: null, alert_type: "data_stale" });

  if (!recentRun) {
    if (!alreadyAlerted.has(staleKey)) {
      await supabase.from("stocks_alerts").insert({
        user_id: userId,
        alert_type: "data_stale",
        message: "尚未完成任何每日分析，建議先執行分析取得最新數據。",
        alert_date: today
      });
    }
  } else {
    const completedAt = new Date((recentRun as { completed_at: string }).completed_at);
    const ageHours = (Date.now() - completedAt.getTime()) / 3_600_000;

    if (ageHours > 25 && !alreadyAlerted.has(staleKey)) {
      await supabase.from("stocks_alerts").insert({
        user_id: userId,
        alert_type: "data_stale",
        message: `上次分析已超過 ${Math.floor(ageHours)} 小時，建議重新執行分析。`,
        alert_date: today
      });
    }
  }

  const { data: allAlerts } = await supabase
    .from("stocks_alerts")
    .select("id, alert_type, symbol, market, message, current_price, threshold_price, is_read, created_at")
    .eq("user_id", userId)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  return (allAlerts ?? []) as Alert[];
}
