const TW_HOLIDAYS_2025 = [
  "2025-01-01",
  "2025-01-27",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-01-31",
  "2025-02-28",
  "2025-04-03",
  "2025-04-04",
  "2025-05-01",
  "2025-05-30",
  "2025-10-06",
  "2025-10-10"
];

const TW_HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-02-20",
  "2026-02-27",
  "2026-04-03",
  "2026-04-06",
  "2026-05-01",
  "2026-06-22",
  "2026-10-01",
  "2026-10-09"
];

const US_HOLIDAYS_2025 = [
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25"
];

const US_HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25"
];

const TW_HOLIDAY_SET = new Set([...TW_HOLIDAYS_2025, ...TW_HOLIDAYS_2026]);
const US_HOLIDAY_SET = new Set([...US_HOLIDAYS_2025, ...US_HOLIDAYS_2026]);

function utcMinutes(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function localDateStr(date: Date, utcOffsetHours: number): string {
  const shifted = new Date(date.getTime() + utcOffsetHours * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

function isUsDst(date: Date): boolean {
  const year = date.getUTCFullYear();
  const mar1 = new Date(Date.UTC(year, 2, 1));
  const dstStart = new Date(
    Date.UTC(year, 2, 1 + ((7 - mar1.getUTCDay()) % 7) + 7)
  );
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov1.getUTCDay()) % 7)));

  return date >= dstStart && date < dstEnd;
}

export function isTwMarketOpen(now: Date = new Date()): boolean {
  if (isWeekend(now)) return false;

  const twDate = localDateStr(now, 8);
  if (TW_HOLIDAY_SET.has(twDate)) return false;

  const minutes = utcMinutes(now);
  return minutes >= 30 && minutes < 390;
}

export function isUsMarketOpen(now: Date = new Date()): boolean {
  if (isWeekend(now)) return false;

  const dst = isUsDst(now);
  const usDate = localDateStr(now, dst ? -4 : -5);
  if (US_HOLIDAY_SET.has(usDate)) return false;

  const minutes = utcMinutes(now);
  const openUtc = dst ? 810 : 870;
  const closeUtc = dst ? 1200 : 1260;
  return minutes >= openUtc && minutes < closeUtc;
}

export function isMarketOpen(market: "US" | "TW", now: Date = new Date()): boolean {
  return market === "TW" ? isTwMarketOpen(now) : isUsMarketOpen(now);
}

export interface MarketStatus {
  open: boolean;
  twOpen: boolean;
  usOpen: boolean;
  label: string;
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const twOpen = isTwMarketOpen(now);
  const usOpen = isUsMarketOpen(now);
  const open = twOpen || usOpen;
  const label =
    twOpen && usOpen
      ? "台股＋美股開盤中 · 每分鐘更新"
      : twOpen
        ? "台股開盤中 · 每分鐘更新"
        : usOpen
          ? "美股開盤中 · 每分鐘更新"
          : "休市中";

  return { open, twOpen, usOpen, label };
}
