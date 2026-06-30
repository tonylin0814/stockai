# Codex Prompt 16 — 股票詳情頁 (Stock Detail Page)

**Goal**: 點擊 portfolio 列表中的任何一支股票，進入該股票的詳情頁。詳情頁顯示：現價、今日高低、買賣一價、持倉損益、歷史趨勢圖、最新新聞、上次 AI 分析結果（附時間戳）。有兩個按鈕：「更新市場資料」和「重新執行 AI 分析」。

**Apply after**: Prompts 01–15 applied.

**Important**: `runSingleStockMission` already exists in `src/lib/analysis/pipeline/single-stock.ts`. Do NOT rewrite it. This prompt only adds UI and a new API route that calls it.

---

## Step 1: New API route — `src/app/api/analysis/stock-detail/[holdingId]/route.ts`

This route looks up the holding, creates a new mission, runs `runSingleStockMission`, and returns the result. Called when user clicks "重新執行 AI 分析".

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildMissionDataPackage } from "@/lib/analysis/mission-package";
import { runSingleStockMission } from "@/lib/analysis/pipeline/single-stock";
import { runWebResearch } from "@/lib/analysis/web-research";

export const maxDuration = 120;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "未知錯誤";
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { holdingId: string } }
) {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登入。" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const holdingId = params.holdingId;

  // 1. Look up the holding and its security
  const { data: holding, error: holdingError } = await supabase
    .from("portfolio_holdings")
    .select("id, shares, securities(symbol, market, name)")
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (holdingError || !holding) {
    return NextResponse.json({ error: "找不到持股。" }, { status: 404 });
  }

  const security = (holding as { securities: { symbol: string; market: string; name: string } | null }).securities;

  if (!security) {
    return NextResponse.json({ error: "找不到股票資料。" }, { status: 404 });
  }

  try {
    // 2. Create a new single_stock mission
    const title = `快速分析：${security.symbol} ${security.name}`;
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .insert({
        user_id: user.id,
        title,
        mission_type: "single_stock",
        original_question: `請分析 ${security.symbol}（${security.name}）目前的投資價值與建議。`,
        related_symbols: [security.symbol],
        status: "running",
        started_at: new Date().toISOString(),
        data_package: { relatedMarket: security.market }
      })
      .select("id")
      .single();

    if (missionError || !mission) {
      throw new Error(missionError?.message ?? "任務建立失敗。");
    }

    const missionId = (mission as { id: string }).id;

    // 3. Build data package (reuses existing infrastructure)
    const dataPackage = await buildMissionDataPackage(user.id, missionId);

    // 4. Run web research for US stocks only
    if (security.market === "US") {
      dataPackage.webResearch = await runWebResearch({
        symbols: [{ symbol: security.symbol, name: security.name, market: "US" }]
      });
    }

    // 5. Run single stock mission (GPT + Claude in parallel, builds consensus)
    await runSingleStockMission({
      userId: user.id,
      missionId,
      dataPackage
    });

    // 6. Mark mission as completed
    await supabase
      .from("missions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", missionId)
      .eq("user_id", user.id);

    return NextResponse.json({ missionId });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
```

---

## Step 2: New client button — `src/components/stock-quick-analysis-button.tsx`

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

interface StockQuickAnalysisButtonProps {
  holdingId: string;
  /** After analysis completes, redirect here (defaults to current page refresh) */
  redirectTo?: string;
}

export function StockQuickAnalysisButton({
  holdingId,
  redirectTo
}: StockQuickAnalysisButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(`/api/analysis/stock-detail/${holdingId}`, {
        method: "POST"
      });

      const json = await response.json() as { missionId?: string; error?: string };

      if (!response.ok) {
        throw new Error(json.error ?? "分析失敗。");
      }

      setStatus("done");

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        // Refresh current page to show updated AI results
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            分析中…（約 20–40 秒）
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            重新執行 AI 分析
          </>
        )}
      </Button>
      {status === "error" && error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      {status === "done" && (
        <p className="text-xs text-green-600">分析完成，頁面更新中…</p>
      )}
    </div>
  );
}
```

---

## Step 3: New server action for market data refresh — add to `src/app/actions.ts`

Add this function at the bottom of `src/app/actions.ts`:

```typescript
export async function refreshStockMarketData(holdingId: string) {
  "use server";
  revalidatePath(`/portfolio/${holdingId}`);
  redirect(`/portfolio/${holdingId}`);
}
```

Make sure `revalidatePath` and `redirect` are imported from `"next/cache"` and `"next/navigation"` respectively. Check the existing imports at the top of `actions.ts` — these are likely already imported.

---

## Step 4: New page — `src/app/portfolio/[id]/page.tsx`

This is a server component (no `"use client"`). It fetches all data server-side.

```typescript
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { notFound } from "next/navigation";
import { QualityBadge } from "@/components/quality-badge";
import { StockQuickAnalysisButton } from "@/components/stock-quick-analysis-button";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refreshStockMarketData } from "@/app/actions";

// ── Helper: format day high/low and bid/ask ───────────────────────────────────
function formatMarketRef(quote: {
  dayHigh?: number;
  dayLow?: number;
  bid?: number;
  ask?: number;
}): { dayRange: string | null; bidAsk: string | null } {
  const dayRange =
    quote.dayHigh && quote.dayLow
      ? `${formatNumber(quote.dayLow, 2)} – ${formatNumber(quote.dayHigh, 2)}`
      : null;
  const bidAsk =
    quote.bid && quote.ask
      ? `${formatNumber(quote.bid, 2)} / ${formatNumber(quote.ask, 2)}`
      : null;

  return { dayRange, bidAsk };
}

// ── Action label maps ─────────────────────────────────────────────────────────
const ACTION_LABEL: Record<string, string> = {
  buy: "買入",
  small_buy: "小部位買入",
  add: "加碼",
  hold: "持有",
  wait: "觀望",
  watch: "追蹤",
  reduce: "減碼",
  sell: "賣出",
  avoid: "避開",
  reject: "不適合",
  act: "執行",
  no_action: "不行動"
};

const ACTION_COLOR: Record<string, string> = {
  buy: "text-green-700 bg-green-50",
  small_buy: "text-green-600 bg-green-50",
  add: "text-green-600 bg-green-50",
  hold: "text-blue-700 bg-blue-50",
  wait: "text-yellow-700 bg-yellow-50",
  watch: "text-yellow-600 bg-yellow-50",
  reduce: "text-orange-700 bg-orange-50",
  sell: "text-red-700 bg-red-50",
  avoid: "text-red-600 bg-red-50",
  reject: "text-red-600 bg-red-50"
};

export default async function StockDetailPage({
  params
}: {
  params: { id: string };
}) {
  const holdingId = params.id;
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // ── Fetch holding ──────────────────────────────────────────────────────────
  const { data: holdingData } = await supabase
    .from("portfolio_holdings")
    .select(
      "id, shares, average_cost, cost_currency, strategy, notes, opened_at, securities(id, symbol, market, name, security_type)"
    )
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!holdingData) {
    notFound();
  }

  const holding = holdingData as {
    id: string;
    shares: number;
    average_cost: number;
    cost_currency: string;
    strategy: string | null;
    notes: string | null;
    opened_at: string | null;
    securities: {
      id: string;
      symbol: string;
      market: string;
      name: string;
      security_type: string;
    } | null;
  };

  const security = holding.securities;
  if (!security) notFound();

  // ── Fetch market data (quote, history, news) in parallel ──────────────────
  const provider = getMarketDataProvider();
  const [quote, history, news] = await Promise.all([
    provider.getQuote(security.symbol, security.market as "US" | "TW"),
    provider.getHistory(security.symbol, security.market as "US" | "TW", 30),
    provider.getNews(security.symbol)
  ]);

  const hasPrice = quote.qualityState !== "missing";
  const currentPrice = hasPrice ? quote.price : null;
  const marketValue = currentPrice ? holding.shares * currentPrice : null;
  const pnl =
    currentPrice !== null
      ? (currentPrice - holding.average_cost) * holding.shares
      : null;
  const returnPct =
    currentPrice !== null && holding.average_cost > 0
      ? ((currentPrice - holding.average_cost) / holding.average_cost) * 100
      : null;
  const { dayRange, bidAsk } = hasPrice ? formatMarketRef(quote) : { dayRange: null, bidAsk: null };

  // ── Fetch last AI recommendations (committee level, latest first) ──────────
  const { data: recommendations } = await supabase
    .from("recommendations")
    .select(
      "id, action, reason, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, key_risks, time_horizon, source_type, source_name, recommendation_date, created_at"
    )
    .eq("user_id", user.id)
    .eq("security_id", security.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const latestRec = (recommendations ?? [])[0] as {
    id: string;
    action: string;
    reason: string;
    confidence: number;
    buy_zone_low: number | null;
    buy_zone_high: number | null;
    target_price: number | null;
    stop_loss: number | null;
    key_risks: string[];
    time_horizon: string | null;
    source_type: string;
    source_name: string;
    recommendation_date: string;
    created_at: string;
  } | undefined;

  const refreshAction = refreshStockMarketData.bind(null, holdingId);

  // ── Compute P&L color ──────────────────────────────────────────────────────
  const pnlClass =
    pnl === null ? "text-slate-500" : pnl < 0 ? "text-red-700" : "text-green-700";

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/portfolio">
            <Button type="button" variant="secondary" size="icon" aria-label="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">
              {security.symbol}
              <span className="ml-2 text-slate-500">{security.name}</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {security.market} · {security.security_type}
              {holding.strategy && ` · 策略：${holding.strategy}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 更新市場資料 — server action */}
          <form action={refreshAction}>
            <Button type="submit" variant="secondary">
              <RefreshCw className="h-4 w-4" />
              更新市場資料
            </Button>
          </form>
          {/* 重新執行 AI 分析 — client component */}
          <StockQuickAnalysisButton holdingId={holdingId} />
        </div>
      </div>

      {/* ── Price cards ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">現價</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {hasPrice ? formatNumber(quote.price, 2) : "—"}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {hasPrice && (
              <span
                className={`text-sm font-medium ${quote.changePct >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {formatSignedPercent(quote.changePct)}
              </span>
            )}
            <QualityBadge state={quote.qualityState} />
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">今日區間</div>
          <div className="mt-1 text-base font-medium text-slate-950">
            {dayRange ?? "—"}
          </div>
          {bidAsk && (
            <div className="mt-1 text-xs text-slate-500">
              買 / 賣：{bidAsk}
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">持倉市值</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {marketValue !== null
              ? formatCurrency(marketValue, holding.cost_currency)
              : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatNumber(holding.shares, 4)} 股 × 成本{" "}
            {formatNumber(holding.average_cost, 2)}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">未實現損益</div>
          <div className={`mt-1 text-xl font-semibold ${pnlClass}`}>
            {pnl !== null ? formatCurrency(pnl, holding.cost_currency) : "—"}
          </div>
          <div className={`mt-1 text-sm font-medium ${pnlClass}`}>
            {returnPct !== null ? formatSignedPercent(returnPct) : ""}
          </div>
        </div>
      </div>

      {/* ── AI 分析結果 ── */}
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">AI 分析建議</h2>

        {latestRec ? (
          <div className="mt-4 space-y-4">
            {/* Action + confidence */}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-md px-3 py-1 text-sm font-semibold ${ACTION_COLOR[latestRec.action] ?? "text-slate-700 bg-slate-100"}`}
              >
                {ACTION_LABEL[latestRec.action] ?? latestRec.action.toUpperCase()}
              </span>
              <span className="text-sm text-slate-600">
                信心度：{latestRec.confidence}%
              </span>
              <span className="text-sm text-slate-500">
                來源：{latestRec.source_name}（{latestRec.source_type}）
              </span>
              <span className="ml-auto text-xs text-slate-400">
                更新時間：{formatDateTime(latestRec.created_at)}
              </span>
            </div>

            {/* Price targets */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-slate-500">建議買進區間</div>
                <div className="font-medium text-slate-900">
                  {latestRec.buy_zone_low && latestRec.buy_zone_high
                    ? `${formatNumber(latestRec.buy_zone_low, 2)} – ${formatNumber(latestRec.buy_zone_high, 2)}`
                    : "不適用"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">目標價</div>
                <div className="font-medium text-slate-900">
                  {latestRec.target_price ? formatNumber(latestRec.target_price, 2) : "不適用"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">停損點</div>
                <div className="font-medium text-red-700">
                  {latestRec.stop_loss ? formatNumber(latestRec.stop_loss, 2) : "不適用"}
                </div>
              </div>
            </div>

            {/* Reason */}
            <div>
              <div className="text-sm font-medium text-slate-700">分析理由</div>
              <p className="mt-1 text-sm text-slate-600">{latestRec.reason}</p>
            </div>

            {/* Key risks */}
            {latestRec.key_risks?.length > 0 && (
              <div>
                <div className="text-sm font-medium text-slate-700">主要風險</div>
                <ul className="mt-1 space-y-1">
                  {latestRec.key_risks.map((risk, index) => (
                    <li key={index} className="text-sm text-slate-600">
                      · {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">
            尚無 AI 分析結果。點擊「重新執行 AI 分析」來取得建議。
          </div>
        )}
      </div>

      {/* ── Price history (OHLCV table, last 10 days) ── */}
      {history.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">近期走勢（30 日）</h2>
          <Table>
            <thead>
              <tr>
                <Th>日期</Th>
                <Th>開盤</Th>
                <Th>最高</Th>
                <Th>最低</Th>
                <Th>收盤</Th>
                <Th>成交量</Th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().slice(0, 10).map((candle) => (
                <tr key={candle.date}>
                  <Td>{candle.date}</Td>
                  <Td>{formatNumber(candle.open, 2)}</Td>
                  <Td>{formatNumber(candle.high, 2)}</Td>
                  <Td>{formatNumber(candle.low, 2)}</Td>
                  <Td
                    className={
                      candle.close >= candle.open ? "text-green-700" : "text-red-700"
                    }
                  >
                    {formatNumber(candle.close, 2)}
                  </Td>
                  <Td>{candle.volume ? formatNumber(candle.volume / 1000, 0) + "K" : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* ── News ── */}
      {news.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">最新新聞</h2>
          <div className="space-y-3">
            {news.slice(0, 8).map((item, index) => (
              <div key={index} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-700 hover:underline"
                >
                  {item.headline}
                </a>
                {item.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.summary}</p>
                )}
                <div className="mt-1 text-xs text-slate-400">
                  {item.source} · {formatDateTime(item.publishedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Holding notes ── */}
      {holding.notes && (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-slate-950">備註</h2>
          <p className="text-sm text-slate-600">{holding.notes}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Step 5: Update `src/app/portfolio/page.tsx` — make rows clickable

In the portfolio table, wrap the symbol cell with a link to the detail page.

**Find:**
```tsx
<Td>{holding.securities?.symbol}</Td>
<Td>{holding.securities?.name}</Td>
```

**Replace:**
```tsx
<Td>
  <Link
    href={`/portfolio/${holding.id}`}
    className="font-medium text-blue-700 hover:underline"
  >
    {holding.securities?.symbol}
  </Link>
</Td>
<Td>
  <Link href={`/portfolio/${holding.id}`} className="hover:text-blue-700">
    {holding.securities?.name}
  </Link>
</Td>
```

Make sure `Link` is imported from `"next/link"` at the top of `page.tsx`.

---

## Step 6: TypeScript check

```bash
npx tsc --noEmit
```

Common issues to fix:
- `refreshStockMarketData.bind(null, holdingId)` — if TypeScript complains, cast to `() => Promise<void>`.
- The `Quote` type (after Prompt 15) has optional fields `bid?`, `ask?`, `dayHigh?`, `dayLow?`. The `formatMarketRef` helper accepts these as optional — no cast needed.
- `security.id` from the query — ensure the select string includes `securities(id, ...)`.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/app/api/analysis/stock-detail/[holdingId]/route.ts` | **NEW** — POST: create mission + run single-stock analysis |
| `src/components/stock-quick-analysis-button.tsx` | **NEW** — client button with loading state |
| `src/app/portfolio/[id]/page.tsx` | **NEW** — stock detail page |
| `src/app/actions.ts` | Add `refreshStockMarketData` server action |
| `src/app/portfolio/page.tsx` | Wrap symbol + name cells with `<Link href="/portfolio/[id]">` |

**User flow:**
1. Portfolio page → click symbol → navigate to `/portfolio/[id]`
2. Detail page loads: current quote, P&L, last AI recommendation, 30-day OHLCV, news
3. Click "更新市場資料" → server action revalidates cache, page reloads with fresh quote
4. Click "重新執行 AI 分析" → calls `POST /api/analysis/stock-detail/[holdingId]` → GPT + Claude run in parallel → page refreshes with new recommendation (takes 20–40 seconds)
