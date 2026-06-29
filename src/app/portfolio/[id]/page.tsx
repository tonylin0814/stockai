import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { notFound } from "next/navigation";
import { refreshStockMarketData } from "@/app/actions";
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
import type { Quote } from "@/lib/market-data/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  buy: "bg-green-50 text-green-700",
  small_buy: "bg-green-50 text-green-600",
  add: "bg-green-50 text-green-600",
  hold: "bg-blue-50 text-blue-700",
  wait: "bg-yellow-50 text-yellow-700",
  watch: "bg-yellow-50 text-yellow-600",
  reduce: "bg-orange-50 text-orange-700",
  sell: "bg-red-50 text-red-700",
  avoid: "bg-red-50 text-red-600",
  reject: "bg-red-50 text-red-600"
};

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

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export default async function StockDetailPage({ params }: { params: { id: string } }) {
  const holdingId = params.id;
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: holdingData } = await supabase
    .from("portfolio_holdings")
    .select(
      "id, shares, average_cost, cost_currency, strategy, notes, opened_at, securities(id, symbol, market, name, security_type)"
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
    provider.getHistory(security.symbol, security.market as "US" | "TW", 30),
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
  const { data: recommendations } = await supabase
    .from("recommendations")
    .select(
      "id, action, reason, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, key_risks, time_horizon, source_type, source_name, recommendation_date, created_at"
    )
    .eq("user_id", user.id)
    .eq("security_id", security.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const latestRec = (recommendations ?? [])[0] as
    | {
        id: string;
        action: string;
        reason: string;
        confidence: number;
        buy_zone_low: number | null;
        buy_zone_high: number | null;
        target_price: number | null;
        stop_loss: number | null;
        key_risks: unknown;
        time_horizon: string | null;
        source_type: string;
        source_name: string;
        recommendation_date: string;
        created_at: string;
      }
    | undefined;
  const refreshAction = refreshStockMarketData.bind(null, holdingId);
  const pnlClass =
    pnl === null ? "text-slate-500" : pnl < 0 ? "text-red-700" : "text-green-700";

  return (
    <div className="space-y-6">
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
              {holding.strategy ? ` · 策略：${holding.strategy}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <form action={refreshAction}>
            <Button type="submit" variant="secondary">
              <RefreshCw className="h-4 w-4" />
              更新市場資料
            </Button>
          </form>
          <StockQuickAnalysisButton holdingId={holdingId} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">現價</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {hasPrice ? formatNumber(quote.price, 2) : "—"}
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
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">今日區間</div>
          <div className="mt-1 text-base font-medium text-slate-950">
            {dayRange ?? "—"}
          </div>
          {bidAsk ? <div className="mt-1 text-xs text-slate-500">買 / 賣：{bidAsk}</div> : null}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">持倉市值</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {marketValue !== null ? formatCurrency(marketValue, holding.cost_currency) : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatNumber(holding.shares, 4)} 股 × 成本 {formatNumber(holding.average_cost, 2)}
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

      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">AI 分析建議</h2>
        {latestRec ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-md px-3 py-1 text-sm font-semibold ${
                  ACTION_COLOR[latestRec.action] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {ACTION_LABEL[latestRec.action] ?? latestRec.action.toUpperCase()}
              </span>
              <span className="text-sm text-slate-600">信心度：{latestRec.confidence}%</span>
              <span className="text-sm text-slate-500">
                來源：{latestRec.source_name}（{latestRec.source_type}）
              </span>
              <span className="ml-auto text-xs text-slate-400">
                更新時間：{formatDateTime(latestRec.created_at)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-slate-500">建議買進區間</div>
                <div className="font-medium text-slate-900">
                  {latestRec.buy_zone_low !== null && latestRec.buy_zone_high !== null
                    ? `${formatNumber(latestRec.buy_zone_low, 2)} - ${formatNumber(
                        latestRec.buy_zone_high,
                        2
                      )}`
                    : "不適用"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">目標價</div>
                <div className="font-medium text-slate-900">
                  {latestRec.target_price !== null
                    ? formatNumber(latestRec.target_price, 2)
                    : "不適用"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">停損點</div>
                <div className="font-medium text-red-700">
                  {latestRec.stop_loss !== null
                    ? formatNumber(latestRec.stop_loss, 2)
                    : "不適用"}
                </div>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">分析理由</div>
              <p className="mt-1 text-sm text-slate-600">{latestRec.reason}</p>
            </div>
            {asStringArray(latestRec.key_risks).length ? (
              <div>
                <div className="text-sm font-medium text-slate-700">主要風險</div>
                <ul className="mt-1 space-y-1">
                  {asStringArray(latestRec.key_risks).map((risk, index) => (
                    <li key={index} className="text-sm text-slate-600">
                      · {risk}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-500">
            尚無 AI 分析結果。點擊「重新執行 AI 分析」來取得建議。
          </div>
        )}
      </div>

      {history.length > 0 ? (
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
                  <Td className={candle.close >= candle.open ? "text-green-700" : "text-red-700"}>
                    {formatNumber(candle.close, 2)}
                  </Td>
                  <Td>{candle.volume ? `${formatNumber(candle.volume / 1000, 0)}K` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      {news.length > 0 ? (
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
                {item.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.summary}</p>
                ) : null}
                <div className="mt-1 text-xs text-slate-400">
                  {item.source} · {formatDateTime(item.publishedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {holding.notes ? (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-slate-950">備註</h2>
          <p className="text-sm text-slate-600">{holding.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
