import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { buildDailyDataPackage } from "@/lib/analysis/data-package";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { Quote } from "@/lib/market-data/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type MissionDataPackage = DailyDataPackage & {
  mission: {
    id: string;
    title: string;
    missionType: string;
    originalQuestion: string;
    relatedSymbols: string[];
    relatedSecurities: Array<{
      symbol: string;
      market: "US" | "TW";
      name: string;
      quote: Quote;
      inPortfolio: boolean;
      inWatchlist: boolean;
    }>;
  };
};

type MissionRow = {
  id: string;
  title: string;
  mission_type: string | null;
  original_question: string;
  related_symbols: string[] | null;
  data_package: Record<string, unknown> | null;
};

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\.TW$/, "");
}

function inferMarket(symbol: string): "US" | "TW" {
  const normalized = symbol.trim().toUpperCase();
  return /^\d+$/.test(normalized) || normalized.endsWith(".TW") ? "TW" : "US";
}

function marketPreference(value: unknown): "US" | "TW" | null {
  return value === "US" || value === "TW" ? value : null;
}

export async function buildMissionDataPackage(
  userId: string,
  missionId: string
): Promise<MissionDataPackage> {
  const supabase = createSupabaseServiceClient();
  const provider = getMarketDataProvider();
  const { data: missionData, error } = await supabase
    .from("missions")
    .select("id, title, mission_type, original_question, related_symbols, data_package")
    .eq("id", missionId)
    .eq("user_id", userId)
    .single();

  if (error || !missionData) {
    throw new Error(error?.message ?? "找不到任務。");
  }

  const mission = missionData as MissionRow;
  const dailyPackage = await buildDailyDataPackage(userId);
  const symbols = (mission.related_symbols ?? []).map(normalizeSymbol).filter(Boolean);
  const preferredMarket = marketPreference(mission.data_package?.relatedMarket);
  const [portfolioRows, watchlistRows] = await Promise.all([
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
  const portfolioKeys = new Set(
    ((portfolioRows.data ?? []) as unknown as Array<{ securities: { symbol: string; market: string } | null }>)
      .map((row) => row.securities)
      .filter(Boolean)
      .map((security) => `${normalizeSymbol(security!.symbol)}:${security!.market}`)
  );
  const watchlistKeys = new Set(
    ((watchlistRows.data ?? []) as unknown as Array<{ securities: { symbol: string; market: string } | null }>)
      .map((row) => row.securities)
      .filter(Boolean)
      .map((security) => `${normalizeSymbol(security!.symbol)}:${security!.market}`)
  );
  const relatedSecurities = await Promise.all(
    symbols.map(async (symbol) => {
      const market = preferredMarket ?? inferMarket(symbol);
      const quote = await provider.getQuote(symbol, market);
      const key = `${symbol}:${market}`;

      return {
        symbol,
        market,
        name: symbol,
        quote,
        inPortfolio: portfolioKeys.has(key),
        inWatchlist: watchlistKeys.has(key)
      };
    })
  );

  return {
    ...dailyPackage,
    mission: {
      id: mission.id,
      title: mission.title,
      missionType: mission.mission_type ?? "single_stock",
      originalQuestion: mission.original_question,
      relatedSymbols: symbols,
      relatedSecurities
    }
  };
}
