const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export type EarningsEvent = {
  symbol: string;
  date: string;
  daysUntil: number;
  quarter: number;
  year: number;
  hour: "bmo" | "amc" | "dmh" | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
};

function toNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function daysFromToday(dateString: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isEarningsHour(value: string | undefined): EarningsEvent["hour"] {
  return value === "bmo" || value === "amc" || value === "dmh" ? value : null;
}

async function fetchEarningsForSymbol(
  symbol: string,
  apiKey: string
): Promise<EarningsEvent | null> {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const params = new URLSearchParams({
    from,
    to,
    symbol,
    token: apiKey
  });

  try {
    const response = await fetch(
      `${FINNHUB_BASE_URL}/calendar/earnings?${params.toString()}`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      earningsCalendar?: Array<{
        date?: string;
        quarter?: number;
        year?: number;
        hour?: string;
        epsEstimate?: number | null;
        revenueEstimate?: number | null;
        symbol?: string;
      }>;
    };
    const next = (data.earningsCalendar ?? [])
      .filter((event) => event.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];

    if (!next?.date) return null;

    const daysUntil = daysFromToday(next.date);
    if (daysUntil < 0) return null;

    return {
      symbol: next.symbol ?? symbol,
      date: next.date,
      daysUntil,
      quarter: next.quarter ?? 0,
      year: next.year ?? new Date().getFullYear(),
      hour: isEarningsHour(next.hour),
      epsEstimate: toNumber(next.epsEstimate),
      revenueEstimate: toNumber(next.revenueEstimate)
    };
  } catch {
    return null;
  }
}

export async function getUpcomingEarnings(
  symbols: Array<{ symbol: string; market: string }>
): Promise<EarningsEvent[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const usSymbols = Array.from(
    new Set(
      symbols
        .filter((item) => item.market === "US")
        .map((item) => item.symbol.trim())
        .filter(Boolean)
    )
  );
  if (!usSymbols.length) return [];

  const results = await Promise.all(
    usSymbols.map((symbol) => fetchEarningsForSymbol(symbol, apiKey))
  );

  return results
    .filter((event): event is EarningsEvent => event !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
