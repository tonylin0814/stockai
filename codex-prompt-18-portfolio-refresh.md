# Codex Prompt 18 — Portfolio Page: Smart Auto-Refresh + Market Status Dot + Remove Notes Column

**Goal**:
1. Auto-refresh prices every 60 seconds only when TW or US market is open — correct sessions, DST-aware US hours, full holiday calendars including Taiwan CNY.
2. Show global market status ("台股開盤中 · 每分鐘更新" vs "休市中") in the stats card.
3. Show a small colored dot per row in the table indicating whether that stock's market is open right now.
4. Remove the "備註" column.
5. Reduce Yahoo Finance and Finnhub cache TTL from 300s → 60s.

**Apply after**: Prompts 01–17 applied.

---

## Step 1: Create `src/lib/market-hours.ts`

```typescript
// ── Taiwan market sessions (TST = UTC+8) ─────────────────────────────────────
//
// 盤前委託  08:30–09:00  → UTC 00:30–01:00
// 盤中交易  09:00–13:30  → UTC 01:00–05:30
// 盤後零股  13:40–14:30  → UTC 05:40–06:30
// 盤後定價  14:00–14:30  → UTC 06:00–06:30
// Combined active window:  08:30–14:30 TST = 00:30–06:30 UTC
//
// ── US market sessions (NYSE / NASDAQ) ───────────────────────────────────────
//
// Regular session: 09:30–16:00 ET
// EDT (UTC-4, 2nd Sun Mar → 1st Sun Nov): 13:30–20:00 UTC
// EST (UTC-5, 1st Sun Nov → 2nd Sun Mar): 14:30–21:00 UTC
//
// ── Holiday maintenance ───────────────────────────────────────────────────────
// Update every December for the coming year.
// TW official: https://www.twse.com.tw/zh/holidaySchedule/holidaySchedule
// US official:  https://www.nyse.com/markets/hours-calendars
//
// ⚠️ Taiwan CNY holidays MUST be verified against the official TWSE calendar
// each year. The dates below are best estimates based on the lunar calendar.
// The Taiwan government typically announces the exact schedule in September/October.
// CNY dates by year (初一 = Day 1):
//   2025: Jan 29  →  TWSE closed Jan 27–31 (除夕 + 初一~初四 + adj. Mon)
//   2026: Feb 17  →  TWSE closed Feb 16–20 (除夕 + 初一~初四, estimate)
//   2027: Feb 6   →  Update when government announces
// ─────────────────────────────────────────────────────────────────────────────

// All dates as "YYYY-MM-DD" in local calendar (UTC+8 for TW, ET for US)

// ── Taiwan Holidays ───────────────────────────────────────────────────────────

const TW_HOLIDAYS_2025: string[] = [
  "2025-01-01", // 元旦

  // 農曆春節 2025 — CNY 初一 = Jan 29
  // Government closure: Jan 27 (Mon, adjusted) + Jan 28 (除夕) + Jan 29–31 (初一~初三)
  // Makeup work day: Jan 25 (Sat)
  "2025-01-27",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-01-31",

  "2025-02-28", // 和平紀念日（週五）

  // 兒童節 Apr 4 (Fri) + 清明節 Apr 5 (Sat)
  // Government gave Apr 3 (Thu) as adjusted day off, Apr 4 as regular holiday
  // Apr 5 (Sat) falls on weekend — no extra day needed
  "2025-04-03",
  "2025-04-04",

  "2025-05-01", // 勞動節（週四）

  // 端午節 2025 — 農曆五月初五 = May 31 (Sat)
  // Observed: May 30 (Fri)
  "2025-05-30",

  // 中秋節 2025 — 農曆八月十五 = Oct 6 (Mon)
  "2025-10-06",

  "2025-10-10", // 國慶日（週五）
];

const TW_HOLIDAYS_2026: string[] = [
  "2026-01-01", // 元旦（週四）

  // 農曆春節 2026 — CNY 初一 = Feb 17 (Tue)
  // 除夕 = Feb 16 (Mon)
  // Estimated closure: Feb 16 (Mon, 除夕) + Feb 17 (Tue, 初一) + Feb 18 (Wed, 初二)
  //                   + Feb 19 (Thu, 初三) + Feb 20 (Fri, 初四)
  // ⚠️ Verify: government may add Feb 13 (Fri) as adjusted day off
  //            with Feb 14 (Sat) as makeup work day
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-02-20",

  // 和平紀念日 Feb 28 (Sat) → adjusted to Feb 27 (Fri)
  "2026-02-27",

  // 兒童節 Apr 4 (Sat) → adjusted to Apr 3 (Fri)
  "2026-04-03",

  // 清明節 Apr 5 (Sun) → adjusted to Apr 6 (Mon)
  "2026-04-06",

  "2026-05-01", // 勞動節（週五）

  // 端午節 2026 — 農曆五月初五 ≈ Jun 21 (Sun) → adjusted to Jun 22 (Mon)
  // ⚠️ Verify against TWSE calendar
  "2026-06-22",

  // 中秋節 2026 — 農曆八月十五 ≈ Oct 1 (Thu)
  // ⚠️ Verify against TWSE calendar
  "2026-10-01",

  // 國慶日 Oct 10 (Sat) → adjusted to Oct 9 (Fri)
  "2026-10-09",
];

// ── US Holidays (NYSE) ────────────────────────────────────────────────────────

const US_HOLIDAYS_2025: string[] = [
  "2025-01-01", // New Year's Day
  "2025-01-20", // Martin Luther King Jr. Day
  "2025-02-17", // Presidents' Day
  "2025-04-18", // Good Friday (Easter = Apr 20)
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day (Friday)
  "2025-09-01", // Labor Day
  "2025-11-27", // Thanksgiving
  "2025-12-25", // Christmas
];

const US_HOLIDAYS_2026: string[] = [
  "2026-01-01", // New Year's Day (Thursday)
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday (Easter = Apr 5)
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth (Friday)
  "2026-07-03", // Independence Day observed (Jul 4 = Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas (Friday)
];

// ── Lookup sets ───────────────────────────────────────────────────────────────

const TW_HOLIDAY_SET = new Set([...TW_HOLIDAYS_2025, ...TW_HOLIDAYS_2026]);
const US_HOLIDAY_SET = new Set([...US_HOLIDAYS_2025, ...US_HOLIDAYS_2026]);

// ── Internal helpers ──────────────────────────────────────────────────────────

function utcMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Shift date by UTC offset and return "YYYY-MM-DD" */
function localDateStr(d: Date, utcOffsetHours: number): string {
  const shifted = new Date(d.getTime() + utcOffsetHours * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * True if `d` falls in US daylight saving time.
 * DST: 2nd Sunday in March → 1st Sunday in November.
 */
function isUsDst(d: Date): boolean {
  const y = d.getUTCFullYear();

  const mar1 = new Date(Date.UTC(y, 2, 1));
  // 2nd Sunday in March
  const dstStart = new Date(Date.UTC(y, 2, 1 + ((7 - mar1.getUTCDay()) % 7) + 7));

  const nov1 = new Date(Date.UTC(y, 10, 1));
  // 1st Sunday in November
  const dstEnd = new Date(Date.UTC(y, 10, 1 + ((7 - nov1.getUTCDay()) % 7)));

  return d >= dstStart && d < dstEnd;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isTwMarketOpen(now: Date = new Date()): boolean {
  if (isWeekend(now)) return false;
  const twDate = localDateStr(now, 8);
  if (TW_HOLIDAY_SET.has(twDate)) return false;
  const t = utcMinutes(now);
  return t >= 30 && t < 390; // 00:30–06:30 UTC = 08:30–14:30 TST
}

export function isUsMarketOpen(now: Date = new Date()): boolean {
  if (isWeekend(now)) return false;
  const etOffset = isUsDst(now) ? -4 : -5;
  const usDate = localDateStr(now, etOffset);
  if (US_HOLIDAY_SET.has(usDate)) return false;
  const t = utcMinutes(now);
  const openUtc  = isUsDst(now) ? 810  : 870;   // 13:30 or 14:30 UTC
  const closeUtc = isUsDst(now) ? 1200 : 1260;  // 20:00 or 21:00 UTC
  return t >= openUtc && t < closeUtc;
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
  const open   = twOpen || usOpen;
  const label  = twOpen && usOpen ? "台股＋美股開盤中 · 每分鐘更新"
               : twOpen           ? "台股開盤中 · 每分鐘更新"
               : usOpen           ? "美股開盤中 · 每分鐘更新"
               :                    "休市中";
  return { open, twOpen, usOpen, label };
}
```

---

## Step 2: Create `src/components/smart-auto-refresh.tsx`

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMarketStatus, type MarketStatus } from "@/lib/market-hours";

interface SmartAutoRefreshProps {
  onStatusChange?: (status: MarketStatus) => void;
}

export function SmartAutoRefresh({ onStatusChange }: SmartAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    function tick() {
      const status = getMarketStatus();
      onStatusChange?.(status);
      if (status.open) router.refresh();
    }

    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [router, onStatusChange]);

  return null;
}
```

---

## Step 3: Create `src/components/portfolio-status-bar.tsx`

Renders SmartAutoRefresh + the global market status label for the stats card.

```typescript
"use client";

import { useState, useCallback } from "react";
import { SmartAutoRefresh } from "@/components/smart-auto-refresh";
import { getMarketStatus, type MarketStatus } from "@/lib/market-hours";

export function PortfolioStatusBar() {
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus());
  const handleChange = useCallback((s: MarketStatus) => setStatus(s), []);

  return (
    <>
      <SmartAutoRefresh onStatusChange={handleChange} />
      <span className={`text-xs font-medium ${status.open ? "text-green-600" : "text-slate-400"}`}>
        {status.label}
      </span>
    </>
  );
}
```

---

## Step 4: Create `src/components/market-status-dot.tsx`

Small client component that shows a colored dot next to each stock row indicating whether its market is currently open.

```typescript
"use client";

import { useEffect, useState } from "react";
import { isMarketOpen } from "@/lib/market-hours";

interface MarketStatusDotProps {
  market: "US" | "TW";
}

export function MarketStatusDot({ market }: MarketStatusDotProps) {
  const [open, setOpen] = useState(() => isMarketOpen(market));

  useEffect(() => {
    // Re-check every 60 seconds to catch open/close transitions
    const id = window.setInterval(() => {
      setOpen(isMarketOpen(market));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [market]);

  return (
    <span
      title={open ? `${market === "TW" ? "台股" : "美股"}開市中` : "休市中"}
      className={`inline-block h-2 w-2 rounded-full ${open ? "bg-green-500" : "bg-slate-300"}`}
    />
  );
}
```

Display: green dot = 開市中, grey dot = 休市中. Hovering shows the tooltip.

---

## Step 5: Update `src/app/portfolio/page.tsx`

### 5a. Add imports
```typescript
import { PortfolioStatusBar } from "@/components/portfolio-status-bar";
import { MarketStatusDot } from "@/components/market-status-dot";
```

### 5b. Update "資料時間" stats card
Find:
```tsx
<div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
  <div className="text-sm text-slate-600">資料時間</div>
  <div className="mt-1 text-sm font-medium text-slate-950">
    {latestTimestamp ? formatDateTime(latestTimestamp) : "—"}
  </div>
</div>
```
Replace with:
```tsx
<div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
  <div className="text-sm text-slate-600">最後價格更新</div>
  <div className="mt-1 text-sm font-medium text-slate-950">
    {latestTimestamp ? formatDateTime(latestTimestamp) : "—"}
  </div>
  <div className="mt-1">
    <PortfolioStatusBar />
  </div>
</div>
```

### 5c. Update "市場" column header (no change needed to `<Th>`)

### 5d. Update "市場" cell in each row — add the dot
Find:
```tsx
<Td>{holding.securities?.market}</Td>
```
Replace with:
```tsx
<Td>
  <div className="flex items-center gap-1.5">
    <MarketStatusDot market={holding.securities?.market as "US" | "TW"} />
    <span>{holding.securities?.market}</span>
  </div>
</Td>
```

### 5e. Remove "備註" column header
Find:
```tsx
<Th>備註</Th>
<Th>操作</Th>
```
Replace with:
```tsx
<Th>操作</Th>
```

### 5f. Remove "備註" cell from each row
Find:
```tsx
<Td>{holding.notes || "—"}</Td>
<Td>
  <div className="flex items-center gap-2">
```
Replace with:
```tsx
<Td>
  <div className="flex items-center gap-2">
```

---

## Step 6: Reduce cache TTL

### `src/lib/market-data/yahoo.ts`
Replace **all** `{ next: { revalidate: 300 } }` with `{ next: { revalidate: 60 } }`.

### `src/lib/market-data/finnhub.ts`
Same.

---

## Step 7: TypeScript check

```bash
npx tsc --noEmit
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/market-hours.ts` | **NEW** — TW/US market hours + DST + full 2025–2026 holiday calendars incl. CNY |
| `src/components/smart-auto-refresh.tsx` | **NEW** — calls `router.refresh()` only when a market is open |
| `src/components/portfolio-status-bar.tsx` | **NEW** — global status label in stats card |
| `src/components/market-status-dot.tsx` | **NEW** — green/grey dot per stock row |
| `src/app/portfolio/page.tsx` | Add `<PortfolioStatusBar>` + `<MarketStatusDot>` per row; remove 備註 column |
| `src/lib/market-data/yahoo.ts` | `revalidate: 300` → `revalidate: 60` |
| `src/lib/market-data/finnhub.ts` | `revalidate: 300` → `revalidate: 60` |

---

## ⚠️ CNY Holiday Verification Checklist

Taiwan CNY holidays must be re-verified every year. Check the TWSE official calendar each October/November:

| 年份 | CNY 初一 | 估計休市 | 狀態 |
|------|---------|---------|------|
| 2025 | Jan 29 | Jan 27–31 | ✅ 已確認 |
| 2026 | Feb 17 | Feb 16–20（估計）| ⚠️ 待 TWSE 公告確認 |
| 2027 | Feb 6  | 待定 | ❌ 尚未更新 |

When 2026 official calendar is released, update `TW_HOLIDAYS_2026` in `src/lib/market-hours.ts`.
