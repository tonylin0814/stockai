import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { QualityBadge } from "@/components/quality-badge";
import { StockChart } from "@/components/stock-chart";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { Quote } from "@/lib/market-data/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatMarketRef(quote: Quote) {
  const dayRange =
    quote.dayHigh && quote.dayLow
      ? `${formatNumber(quote.dayLow, 2)} - ${formatNumber(quote.dayHigh, 2)}`
      : null;
  const bidAsk =
    quote.bid && quote.ask
      ? `${formatNumber(quote.bid, 2)} / ${formatNumber(quote.ask, 2)}`
      : null;

  return { dayRange, bidAsk };
}

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

  if (!user) notFound();

  const { data: holdingData } = await supabase
    .from("stocks_portfolio_holdings")
    .select(
      "id, shares, average_cost, cost_currency, strategy, notes, opened_at, securities:stocks_securities(id, symbol, market, name, security_type)"
    )
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!holdingData) notFound();

  const holding = holdingData as unknown as {
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

  const provider = getMarketDataProvider();
  const [quote, history, news] = await Promise.all([
    provider.getQuote(security.symbol, security.market as "US" | "TW"),
    provider.getHistory(security.symbol, security.market as "US" | "TW", 252),
    provider.getNews(security.symbol)
  ]);

  const hasPrice = quote.qualityState !== "missing";
  const currentPrice = hasPrice ? quote.price : null;
  const marketValue = currentPrice !== null ? holding.shares * currentPrice : null;
  const pnl =
    currentPrice !== null ? (currentPrice - holding.average_cost) * holding.shares : null;
  const returnPct =
    currentPrice !== null && holding.average_cost > 0
      ? ((currentPrice - holding.average_cost) / holding.average_cost) * 100
      : null;
  const { dayRange, bidAsk } = hasPrice
    ? formatMarketRef(quote)
    : { dayRange: null, bidAsk: null };
  const pnlClass =
    pnl === null ? "text-slate-500" : pnl < 0 ? "text-red-700" : "text-green-700";
  const { data: missionLinks } = await supabase
    .from("stocks_mission_links")
    .select("mission_id")
    .eq("user_id", user.id)
    .eq("portfolio_holding_id", holdingId);
  const missionIds = Array.from(
    new Set(((missionLinks ?? []) as Array<{ mission_id: string }>).map((link) => link.mission_id))
  );
  const { data: relatedMissions } = missionIds.length
    ? await supabase
        .from("stocks_missions")
        .select("id, title, status, created_at")
        .eq("user_id", user.id)
        .in("id", missionIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/portfolio">
            <Button type="button" variant="secondary" size="icon" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">
              {security.symbol}
              <span className="ml-2 text-slate-500">{security.name}</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {security.market} / {security.security_type}
              {holding.strategy ? ` / ${holding.strategy}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">現價</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {hasPrice ? formatNumber(quote.price, 2) : "-"}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {hasPrice ? (
              <span
                className={`text-sm font-medium ${
                  quote.changePct >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatSignedPercent(quote.changePct)}
              </span>
            ) : null}
            <QualityBadge state={quote.qualityState} />
          </div>
          <div className="mt-1 text-xs text-slate-500">
            資料時間：{formatDateTime(quote.sourceUpdatedAt)}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">今日區間</div>
          <div className="mt-1 text-base font-medium text-slate-950">
            {dayRange ?? "-"}
          </div>
          {bidAsk ? <div className="mt-1 text-xs text-slate-500">買 / 賣：{bidAsk}</div> : null}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">持倉市值</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {marketValue !== null ? formatCurrency(marketValue, holding.cost_currency) : "-"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatNumber(holding.shares, 4)} 股 x 成本 {formatNumber(holding.average_cost, 2)}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">未實現損益</div>
          <div className={`mt-1 text-xl font-semibold ${pnlClass}`}>
            {pnl !== null ? formatCurrency(pnl, holding.cost_currency) : "-"}
          </div>
          <div className={`mt-1 text-sm font-medium ${pnlClass}`}>
            {returnPct !== null ? formatSignedPercent(returnPct) : ""}
          </div>
        </div>
      </div>

      {history.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">近期走勢（252 日）</h2>
          <StockChart data={history} market={security.market as "US" | "TW"} />

          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
              顯示數字明細
            </summary>
            <div className="mt-3 overflow-x-auto">
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
                      <Td className={candle.close >= candle.open ? "text-green-700" : "text-red-700"}>
                        {formatNumber(candle.close, 2)}
                      </Td>
                      <Td>
                        {candle.volume ? `${formatNumber(candle.volume / 1000, 0)}K` : "-"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </details>
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">最新新聞</h2>
          {news.length > 0 ? <span className="text-xs text-slate-400">{news.length} 則</span> : null}
        </div>

        {news.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">目前無相關新聞。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {news.slice(0, 8).map((item, index) => (
              <div key={index} className="py-3 first:pt-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <p className="text-sm font-medium leading-snug text-slate-900 group-hover:text-blue-700 group-hover:underline">
                    {item.headline}
                  </p>
                </a>
                {item.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {item.summary}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">{item.source}</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(item.publishedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {holding.notes ? (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-slate-950">備註</h2>
          <p className="text-sm text-slate-600">{holding.notes}</p>
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">相關任務</h2>
        {(relatedMissions ?? []).length ? (
          <div className="divide-y divide-slate-100">
            {relatedMissions!.map((mission) => (
              <Link
                key={mission.id}
                href={`/missions/${mission.id}`}
                className="block py-3 first:pt-0 last:pb-0 hover:text-blue-700"
              >
                <div className="text-sm font-medium text-slate-950 hover:underline">
                  {mission.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {mission.status} / {formatDateTime(mission.created_at)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">目前沒有關聯任務。</p>
        )}
      </div>
    </div>
  );
}
