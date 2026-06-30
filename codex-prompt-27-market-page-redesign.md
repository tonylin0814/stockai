# Codex Prompt 27 — Market Page Redesign

**Goal**: Replace the current market page (duplicate cards, no portfolio data) with four clear sections:
1. 我的持股 — portfolio holdings with live price + P&L
2. 關注清單 — watchlist items with live price
3. 匯率 — 5 FX pairs
4. 大盤指數 — Dow Jones, NASDAQ, Taiwan Index

**Apply after**: Prompts 01–26 applied.

---

## File: `src/app/markets/page.tsx`

Rewrite the entire file.

---

### Imports

```typescript
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QualityBadge } from "@/components/quality-badge";
import { Table, Td, Th } from "@/components/ui/table";
import {
  formatNumber,
  formatSignedNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { DataQualityState, Quote } from "@/lib/market-data/types";
```

---

### Types

```typescript
type HoldingRow = {
  id: string;
  shares: number;
  average_cost: number;
  cost_currency: string;
  securities: { symbol: string; market: string; name: string } | null;
};

type WatchlistRow = {
  id: string;
  target_buy_price: number | null;
  reason: string | null;
  securities: { symbol: string; market: string; name: string } | null;
};

type FxPair = { label: string; base: string; quote: string };
```

---

### Data fetching

```typescript
export default async function MarketsPage() {
  const supabase = createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  let holdings: HoldingRow[] = [];
  let watchlistItems: WatchlistRow[] = [];

  if (user) {
    const [holdingsResult, watchlistResult] = await Promise.all([
      supabase
        .from("portfolio_holdings")
        .select("id, shares, average_cost, cost_currency, securities(symbol, market, name)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("watchlist_items")
        .select("id, target_buy_price, reason, securities(symbol, market, name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    ]);
    holdings = (holdingsResult.data ?? []) as unknown as HoldingRow[];
    watchlistItems = (watchlistResult.data ?? []) as unknown as WatchlistRow[];
  }

  const fxPairs: FxPair[] = [
    { label: "人民幣 → 美元", base: "CNY", quote: "USD" },
    { label: "美元 → 加幣",   base: "USD", quote: "CAD" },
    { label: "台幣 → 美元",   base: "TWD", quote: "USD" },
    { label: "台幣 → 加幣",   base: "TWD", quote: "CAD" },
    { label: "台幣 → 日圓",   base: "TWD", quote: "JPY" },
  ];

  const provider = getMarketDataProvider();

  const [dow, nasdaq, taiex, ...rest] = await Promise.all([
    provider.getIndex("^DJI", "US"),
    provider.getIndex("^IXIC", "US"),
    provider.getIndex("TAIEX", "TW"),
    ...fxPairs.map((p) => provider.getFXRate(p.base, p.quote)),
    ...holdings.map((h) =>
      h.securities
        ? provider.getQuote(h.securities.symbol, h.securities.market as "US" | "TW")
        : Promise.resolve(null)
    ),
    ...watchlistItems.map((w) =>
      w.securities
        ? provider.getQuote(w.securities.symbol, w.securities.market as "US" | "TW")
        : Promise.resolve(null)
    )
  ]);

  // Split out the rest array
  const fxRates = rest.slice(0, fxPairs.length) as number[];
  const holdingQuotes = rest.slice(fxPairs.length, fxPairs.length + holdings.length) as (Quote | null)[];
  const watchQuotes = rest.slice(fxPairs.length + holdings.length) as (Quote | null)[];
```

---

### JSX structure

```tsx
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">市場總覽</h1>
        <p className="mt-1 text-sm text-slate-600">持股、關注清單、匯率與大盤指數。</p>
      </div>

      {/* ── Section 1: Portfolio ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">我的持股</h2>
        {holdings.length === 0 ? (
          <EmptyState message="尚未建立持股。" linkHref="/portfolio" linkLabel="前往投資組合新增" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>代號</Th>
                <Th>名稱</Th>
                <Th>市場</Th>
                <Th>現價</Th>
                <Th>今日漲跌</Th>
                <Th>今日漲跌%</Th>
                <Th>成本</Th>
                <Th>未實現損益</Th>
                <Th>報酬率</Th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding, i) => {
                const quote = holdingQuotes[i];
                const price = quote?.qualityState !== "missing" ? (quote?.price ?? null) : null;
                const costTotal = holding.average_cost * holding.shares;
                const marketValue = price !== null ? price * holding.shares : null;
                const pnl = marketValue !== null ? marketValue - costTotal : null;
                const ret = pnl !== null && costTotal > 0 ? pnl / costTotal : null;
                return (
                  <tr key={holding.id}>
                    <Td>
                      <Link href={`/portfolio/${holding.id}`} className="font-medium text-blue-700 hover:underline">
                        {holding.securities?.symbol ?? "—"}
                      </Link>
                    </Td>
                    <Td>{holding.securities?.name ?? "—"}</Td>
                    <Td>{holding.securities?.market ?? "—"}</Td>
                    <Td>{price !== null ? formatNumber(price, 2) : "—"}</Td>
                    <Td className={signClass(quote?.change)}>{quote?.change !== undefined && quote.qualityState !== "missing" ? formatSignedNumber(quote.change, 2) : "—"}</Td>
                    <Td className={signClass(quote?.changePct)}>{quote?.changePct !== undefined && quote.qualityState !== "missing" ? formatSignedPercent(quote.changePct) : "—"}</Td>
                    <Td>{formatNumber(holding.average_cost, 2)}</Td>
                    <Td className={signClass(pnl)}>{pnl !== null ? formatSignedNumber(pnl, 2) : "—"}</Td>
                    <Td className={signClass(ret)}>{ret !== null ? formatSignedPercent(ret) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      {/* ── Section 2: Watch List ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">關注清單</h2>
        {watchlistItems.length === 0 ? (
          <EmptyState message="尚未建立關注項目。" linkHref="/watchlist" linkLabel="前往關注清單新增" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>代號</Th>
                <Th>名稱</Th>
                <Th>市場</Th>
                <Th>現價</Th>
                <Th>今日漲跌</Th>
                <Th>今日漲跌%</Th>
                <Th>目標買進價</Th>
                <Th>距目標</Th>
                <Th>關注原因</Th>
              </tr>
            </thead>
            <tbody>
              {watchlistItems.map((item, i) => {
                const quote = watchQuotes[i];
                const price = quote?.qualityState !== "missing" ? (quote?.price ?? null) : null;
                const target = item.target_buy_price;
                const distFromTarget = price !== null && target !== null
                  ? (price - target) / target
                  : null;
                return (
                  <tr key={item.id}>
                    <Td>
                      <Link href="/watchlist" className="font-medium text-blue-700 hover:underline">
                        {item.securities?.symbol ?? "—"}
                      </Link>
                    </Td>
                    <Td>{item.securities?.name ?? "—"}</Td>
                    <Td>{item.securities?.market ?? "—"}</Td>
                    <Td>{price !== null ? formatNumber(price, 2) : "—"}</Td>
                    <Td className={signClass(quote?.change)}>{quote?.change !== undefined && quote.qualityState !== "missing" ? formatSignedNumber(quote.change, 2) : "—"}</Td>
                    <Td className={signClass(quote?.changePct)}>{quote?.changePct !== undefined && quote.qualityState !== "missing" ? formatSignedPercent(quote.changePct) : "—"}</Td>
                    <Td>{target !== null ? formatNumber(target, 2) : "—"}</Td>
                    <Td className={signClass(distFromTarget ? -distFromTarget : null)}>
                      {distFromTarget !== null ? formatSignedPercent(distFromTarget) : "—"}
                    </Td>
                    <Td className="max-w-xs truncate text-slate-600">{item.reason ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      {/* ── Section 3: FX ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">匯率</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {fxPairs.map((pair, i) => (
            <div key={pair.label} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-xs font-medium text-slate-500">{pair.label}</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">
                {fxRates[i] ? formatNumber(fxRates[i], 4) : "—"}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 4: Indexes ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">大盤指數</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { title: "道瓊工業", quote: dow },
            { title: "NASDAQ", quote: nasdaq },
            { title: "台股加權指數", quote: taiex }
          ].map(({ title, quote }) => (
            <IndexCard key={title} title={title} quote={quote} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

---

### Helper components and functions

Add these above the page function:

```typescript
function signClass(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return value < 0 ? "text-red-700" : "text-green-700";
}

function EmptyState({ message, linkHref, linkLabel }: { message: string; linkHref: string; linkLabel: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      {message}{" "}
      <Link href={linkHref} className="text-blue-600 hover:underline">{linkLabel}</Link>
    </div>
  );
}

function IndexCard({ title, quote }: { title: string; quote: Quote }) {
  const isNeg = quote.change < 0;
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        <QualityBadge state={quote.qualityState} />
      </div>
      <div className="text-2xl font-semibold text-slate-950">
        {quote.qualityState === "missing" ? "—" : formatNumber(quote.price, 2)}
      </div>
      <div className={`mt-2 flex items-center gap-3 text-sm ${isNeg ? "text-red-700" : "text-green-700"}`}>
        <span>{quote.qualityState !== "missing" ? formatSignedNumber(quote.change, 2) : "—"}</span>
        <span>{quote.qualityState !== "missing" ? formatSignedPercent(quote.changePct) : "—"}</span>
      </div>
    </div>
  );
}
```

---

## Notes for Codex

- The `rest` array spread order matters: FX rates first, then holding quotes, then watchlist quotes — keep the `Promise.all` order exactly as written
- `provider.getIndex("^DJI", "US")` is the Dow Jones symbol — verify it works the same as `^GSPC`
- `provider.getFXRate(base, quote)` returns a plain `number` (not a Quote object)
- Watchlist table's "距目標" column shows how far current price is from the target buy price — negative means price is below target (good entry approaching), positive means above target
- Remove the old `MarketCard` and `quoteCard` helper — they are no longer used
- Remove unused imports (`Activity`, `BarChart3`, `Landmark`, `formatDateTime`)
- The `user_id` filter on watchlist_items may or may not be needed depending on existing RLS — keep it for safety

---

## Expected layout

```
市場總覽
持股、關注清單、匯率與大盤指數。

我的持股
─────────────────────────────────────────────────────────────────
代號   名稱       市場  現價     今日漲跌  今日漲跌%  成本     未實現損益  報酬率
NVDA   NVIDIA    US    875.30  +12.40   +1.44%   750.00  +12,500    +16.7%
2330   台積電     TW    920.00  +10.00   +1.10%   880.00  +40,000    +4.5%

關注清單
─────────────────────────────────────────────────────────────────
代號   名稱    市場  現價     今日漲跌  今日漲跌%  目標買進價  距目標    關注原因
TSLA   Tesla  US    182.50  -2.30    -1.24%   170.00    +7.35%  等待回調再進場

匯率
[ 人民幣→美元 ] [ 美元→加幣 ] [ 台幣→美元 ] [ 台幣→加幣 ] [ 台幣→日圓 ]
   0.1383         1.3641       0.0307        0.0419       4.6210

大盤指數
[ 道瓊工業    ] [ NASDAQ      ] [ 台股加權指數 ]
  42,150 +185    18,320 +92      20,450 +210
```
