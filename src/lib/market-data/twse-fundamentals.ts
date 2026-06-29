type TwseFundamental = {
  peRatio: number | null;
  dividendYield: number | null;
  pbRatio: number | null;
};

let twseCache: Map<string, TwseFundamental> | null = null;
let twseCacheExpiry = 0;

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const TWSE_BWIBBU_URL = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d";

function parseNumber(value: string | undefined): number | null {
  if (!value || value === "-" || value === "—" || value.trim() === "") return null;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function loadTwseData(): Promise<Map<string, TwseFundamental>> {
  const response = await fetch(TWSE_BWIBBU_URL, {
    next: { revalidate: 14400 },
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`TWSE BWIBBU_d HTTP ${response.status}`);
  }

  const rows = (await response.json()) as Array<{
    Code?: string;
    PEratio?: string;
    DividendYield?: string;
    PBratio?: string;
  }>;

  const map = new Map<string, TwseFundamental>();
  for (const row of rows) {
    if (!row.Code) continue;
    map.set(row.Code.trim(), {
      peRatio: parseNumber(row.PEratio),
      dividendYield: parseNumber(row.DividendYield),
      pbRatio: parseNumber(row.PBratio)
    });
  }

  return map;
}

export async function getTwseFundamentals(
  symbol: string
): Promise<TwseFundamental | null> {
  const code = symbol.split(".")[0]?.trim();
  if (!code) return null;

  const now = Date.now();
  if (!twseCache || now > twseCacheExpiry) {
    try {
      twseCache = await loadTwseData();
      twseCacheExpiry = now + CACHE_TTL_MS;
    } catch (error) {
      console.warn("[twse-fundamentals] Failed to load TWSE data:", error);
      return null;
    }
  }

  return twseCache.get(code) ?? null;
}
