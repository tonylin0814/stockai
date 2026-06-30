import Link from "next/link";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { QualityBadge } from "@/components/quality-badge";
import { Table, Td, Th } from "@/components/ui/table";
import {
  formatDateTime,
  formatNumber,
  formatSignedNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { Quote } from "@/lib/market-data/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type SimPositionRow = {
  id: string;
  symbol: string;
  market: string;
  name: string;
  shares: number;
  avg_cost_price: number;
  current_price: number | null;
  sim_portfolios: { division: string; market: string } | null;
};

type FxPair = { label: string; base: string; quote: string };

function signClass(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "";
  return value < 0 ? "text-red-700" : "text-green-700";
}

function isMarket(value: string | undefined): value is "US" | "TW" {
  return value === "US" || value === "TW";
}

function latestQuoteTime(quotes: Array<Quote | null | undefined>) {
  return quotes
    .map((quote) => quote?.sourceUpdatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function EmptyState({
  message,
  linkHref,
  linkLabel
}: {
  message: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      {message}{" "}
      <Link href={linkHref} className="text-blue-600 hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}

function IndexCard({ title, quote }: { title: string; quote: Quote }) {
  const isMissing = quote.qualityState === "missing";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        <QualityBadge state={quote.qualityState} />
      </div>
      <div className="text-2xl font-semibold text-slate-950">
        {isMissing ? "—" : formatNumber(quote.price, 2)}
      </div>
      <div className={`mt-2 flex items-center gap-3 text-sm ${signClass(quote.change)}`}>
        <span>{isMissing ? "—" : formatSignedNumber(quote.change, 2)}</span>
        <span>{isMissing ? "—" : formatSignedPercent(quote.changePct)}</span>
      </div>
      <div className="mt-2 text-xs text-slate-500">
        資料時間：{formatDateTime(quote.sourceUpdatedAt)}
      </div>
    </div>
  );
}

export default async function MarketsPage({
  searchParams
}: {
  searchParams?: { updated?: string };
}) {
  const refreshedAt = new Date().toISOString();
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
  let simPositions: SimPositionRow[] = [];

  if (user) {
    const [holdingsResult, watchlistResult, simPositionsResult] = await Promise.all([
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
        .order("created_at", { ascending: false }),
      supabase
        .from("sim_positions")
        .select("id, symbol, market, name, shares, avg_cost_price, current_price, sim_portfolios!inner(division, market, user_id)")
        .eq("sim_portfolios.user_id", user.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
    ]);

    holdings = (holdingsResult.data ?? []) as unknown as HoldingRow[];
    watchlistItems = (watchlistResult.data ?? []) as unknown as WatchlistRow[];
    simPositions = (simPositionsResult.data ?? []) as unknown as SimPositionRow[];
  }

  const fxPairs: FxPair[] = [
    { label: "美元 → 人民幣", base: "USD", quote: "CNY" },
    { label: "美元 → 台幣", base: "USD", quote: "TWD" },
    { label: "加幣 → 台幣", base: "CAD", quote: "TWD" },
    { label: "美元 → 日圓", base: "USD", quote: "JPY" },
    { label: "台幣 → 日圓", base: "TWD", quote: "JPY" }
  ];
  const provider = getMarketDataProvider();
  const [dow, nasdaq, taiex, ...rest] = await Promise.all([
    provider.getIndex("^DJI", "US"),
    provider.getIndex("^IXIC", "US"),
    provider.getIndex("TAIEX", "TW"),
    ...fxPairs.map((pair) => provider.getFXRate(pair.base, pair.quote)),
    ...holdings.map((holding) =>
      holding.securities && isMarket(holding.securities.market)
        ? provider.getQuote(holding.securities.symbol, holding.securities.market)
        : Promise.resolve(null)
    ),
    ...watchlistItems.map((item) =>
      item.securities && isMarket(item.securities.market)
        ? provider.getQuote(item.securities.symbol, item.securities.market)
        : Promise.resolve(null)
    ),
    ...simPositions.map((position) =>
      isMarket(position.market)
        ? provider.getQuote(position.symbol, position.market)
        : Promise.resolve(null)
    )
  ]);
  const fxRates = rest.slice(0, fxPairs.length) as number[];
  const holdingQuotes = rest.slice(
    fxPairs.length,
    fxPairs.length + holdings.length
  ) as (Quote | null)[];
  const watchQuotes = rest.slice(
    fxPairs.length + holdings.length,
    fxPairs.length + holdings.length + watchlistItems.length
  ) as (Quote | null)[];
  const simQuotes = rest.slice(fxPairs.length + holdings.length + watchlistItems.length) as (Quote | null)[];
  const marketDataUpdatedAt = latestQuoteTime([dow, nasdaq, taiex, ...holdingQuotes, ...watchQuotes, ...simQuotes]);

  let lastAnalysisAt: string | null = null;
  if (user) {
    const { data: lastRun } = await supabase
      .from("daily_runs")
      .select("completed_at, started_at, created_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const run = lastRun as { completed_at?: string | null; started_at?: string | null; created_at?: string | null } | null;
    lastAnalysisAt = run?.completed_at ?? run?.started_at ?? run?.created_at ?? null;
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">市場總覽</h1>
          <p className="mt-1 text-sm text-slate-600">
            持股、關注清單、匯率與大盤指數。
          </p>
        </div>
        <div className="space-y-2 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <RunAnalysisButton label="執行全系統分析" />
          </div>
          <p className="text-xs text-slate-500">
            上一次全系統分析：{lastAnalysisAt ? formatDateTime(lastAnalysisAt) : "—"}
          </p>
          {searchParams?.updated === "1" ? (
            <p className="text-xs text-green-700">市場資料已更新。</p>
          ) : null}
          <div className="space-y-0.5 text-xs text-slate-500">
            <p>本頁重新抓取：{formatDateTime(refreshedAt)}</p>
            <p>資料來源時間：{marketDataUpdatedAt ? formatDateTime(marketDataUpdatedAt) : "—"}</p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">我的持股</h2>
        {holdings.length === 0 ? (
          <EmptyState
            message="尚未建立持股。"
            linkHref="/portfolio"
            linkLabel="前往投資組合新增"
          />
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
              {holdings.map((holding, index) => {
                const quote = holdingQuotes[index];
                const price = quote?.qualityState !== "missing" ? (quote?.price ?? null) : null;
                const costTotal = holding.average_cost * holding.shares;
                const marketValue = price !== null ? price * holding.shares : null;
                const pnl = marketValue !== null ? marketValue - costTotal : null;
                const returnPct = pnl !== null && costTotal > 0 ? (pnl / costTotal) * 100 : null;

                return (
                  <tr key={holding.id}>
                    <Td>
                      <Link
                        href={`/portfolio/${holding.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {holding.securities?.symbol ?? "—"}
                      </Link>
                    </Td>
                    <Td>{holding.securities?.name ?? "—"}</Td>
                    <Td>{holding.securities?.market ?? "—"}</Td>
                    <Td>{price !== null ? formatNumber(price, 2) : "—"}</Td>
                    <Td className={signClass(quote?.change)}>
                      {quote && quote.qualityState !== "missing"
                        ? formatSignedNumber(quote.change, 2)
                        : "—"}
                    </Td>
                    <Td className={signClass(quote?.changePct)}>
                      {quote && quote.qualityState !== "missing"
                        ? formatSignedPercent(quote.changePct)
                        : "—"}
                    </Td>
                    <Td>{formatNumber(holding.average_cost, 2)}</Td>
                    <Td className={signClass(pnl)}>
                      {pnl !== null ? formatSignedNumber(pnl, 2) : "—"}
                    </Td>
                    <Td className={signClass(returnPct)}>
                      {returnPct !== null ? formatSignedPercent(returnPct) : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">模擬交易持股</h2>
        {simPositions.length === 0 ? (
          <EmptyState
            message="尚未建立模擬持股。"
            linkHref="/performance/simulation"
            linkLabel="前往模擬交易"
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Division</Th>
                <Th>代號</Th>
                <Th>名稱</Th>
                <Th>市場</Th>
                <Th>股數</Th>
                <Th>現價</Th>
                <Th>今日漲跌%</Th>
                <Th>成本</Th>
                <Th>未實現損益</Th>
                <Th>報酬率</Th>
              </tr>
            </thead>
            <tbody>
              {simPositions.map((position, index) => {
                const quote = simQuotes[index];
                const price =
                  quote && quote.qualityState !== "missing"
                    ? quote.price
                    : position.current_price;
                const costTotal = Number(position.avg_cost_price) * Number(position.shares);
                const marketValue = price !== null ? Number(price) * Number(position.shares) : null;
                const pnl = marketValue !== null ? marketValue - costTotal : null;
                const returnPct = pnl !== null && costTotal > 0 ? (pnl / costTotal) * 100 : null;

                return (
                  <tr key={position.id}>
                    <Td>{position.sim_portfolios?.division === "anthropic" ? "Anthropic" : "GPT"}</Td>
                    <Td>
                      <Link
                        href="/performance/simulation"
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {position.symbol}
                      </Link>
                    </Td>
                    <Td>{position.name}</Td>
                    <Td>{position.market}</Td>
                    <Td>{formatNumber(Number(position.shares), 2)}</Td>
                    <Td>{price !== null ? formatNumber(Number(price), 2) : "—"}</Td>
                    <Td className={signClass(quote?.changePct)}>
                      {quote && quote.qualityState !== "missing"
                        ? formatSignedPercent(quote.changePct)
                        : "—"}
                    </Td>
                    <Td>{formatNumber(Number(position.avg_cost_price), 2)}</Td>
                    <Td className={signClass(pnl)}>
                      {pnl !== null ? formatSignedNumber(pnl, 2) : "—"}
                    </Td>
                    <Td className={signClass(returnPct)}>
                      {returnPct !== null ? formatSignedPercent(returnPct) : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">關注清單</h2>
        {watchlistItems.length === 0 ? (
          <EmptyState
            message="尚未建立關注項目。"
            linkHref="/watchlist"
            linkLabel="前往關注清單新增"
          />
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
              {watchlistItems.map((item, index) => {
                const quote = watchQuotes[index];
                const price = quote?.qualityState !== "missing" ? (quote?.price ?? null) : null;
                const target = item.target_buy_price;
                const distanceFromTarget =
                  price !== null && target !== null ? ((price - target) / target) * 100 : null;

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
                    <Td className={signClass(quote?.change)}>
                      {quote && quote.qualityState !== "missing"
                        ? formatSignedNumber(quote.change, 2)
                        : "—"}
                    </Td>
                    <Td className={signClass(quote?.changePct)}>
                      {quote && quote.qualityState !== "missing"
                        ? formatSignedPercent(quote.changePct)
                        : "—"}
                    </Td>
                    <Td>{target !== null ? formatNumber(target, 2) : "—"}</Td>
                    <Td className={signClass(distanceFromTarget ? -distanceFromTarget : null)}>
                      {distanceFromTarget !== null
                        ? formatSignedPercent(distanceFromTarget)
                        : "—"}
                    </Td>
                    <Td className="max-w-xs truncate text-slate-600">{item.reason ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">匯率</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {fxPairs.map((pair, index) => (
            <div
              key={pair.label}
              className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="text-xs font-medium text-slate-500">{pair.label}</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">
                {fxRates[index] ? formatNumber(fxRates[index], 4) : "—"}
              </div>
            </div>
          ))}
        </div>
      </section>

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
