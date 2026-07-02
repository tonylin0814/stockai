import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { deletePortfolioTransaction } from "@/app/actions";
import {
  AddTransactionDialog,
  EditTransactionDialog,
  type PortfolioTransactionFormValue
} from "@/app/portfolio/[id]/transaction-dialogs";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { QualityBadge } from "@/components/quality-badge";
import { StockChart } from "@/components/stock-chart";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSignedNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PortfolioTransaction = PortfolioTransactionFormValue & {
  created_at: string;
};

function transactionTypeLabel(type: "buy" | "sell") {
  return type === "buy" ? "買入" : "賣出";
}

function transactionTypeClass(type: "buy" | "sell") {
  return type === "buy" ? "text-green-700" : "text-red-700";
}

function calculateRealizedPnl(transactions: PortfolioTransaction[]) {
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = a.trade_date.localeCompare(b.trade_date);
    if (dateDiff !== 0) return dateDiff;
    return a.created_at.localeCompare(b.created_at);
  });
  const realizedById = new Map<string, number | null>();
  let shares = 0;
  let costBasis = 0;

  for (const transaction of sorted) {
    if (transaction.transaction_type === "buy") {
      shares += transaction.shares;
      costBasis += transaction.shares * transaction.price + transaction.fees;
      realizedById.set(transaction.id, null);
      continue;
    }

    const averageCost = shares > 0 ? costBasis / shares : 0;
    const realizedPnl = (transaction.price - averageCost) * transaction.shares - transaction.fees;
    shares = Math.max(0, shares - transaction.shares);
    costBasis = Math.max(0, costBasis - averageCost * transaction.shares);
    realizedById.set(transaction.id, realizedPnl);

    if (shares < 0.000001) {
      shares = 0;
      costBasis = 0;
    }
  }

  return realizedById;
}

export default async function StockDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { analysisPage?: string };
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
  const pnlClass =
    pnl === null ? "text-slate-500" : pnl < 0 ? "text-red-700" : "text-green-700";
  const { data: transactionsData, error: transactionsError } = await supabase
    .from("stocks_portfolio_transactions")
    .select("id, holding_id, transaction_type, trade_date, shares, price, currency, fees, notes, created_at")
    .eq("user_id", user.id)
    .eq("holding_id", holdingId)
    .order("trade_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (transactionsError) {
    throw new Error(transactionsError.message);
  }

  const transactions = (transactionsData ?? []) as unknown as PortfolioTransaction[];
  const realizedById = calculateRealizedPnl(transactions);
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
  const analysisPage = Math.max(1, Number(searchParams?.analysisPage ?? 1) || 1);
  const analysisPageSize = 5;
  const relatedAnalysisRows = relatedMissions ?? [];
  const analysisStart = (analysisPage - 1) * analysisPageSize;
  const pagedAnalysisRows = relatedAnalysisRows.slice(
    analysisStart,
    analysisStart + analysisPageSize
  );
  const hasPreviousAnalysisPage = analysisPage > 1;
  const hasNextAnalysisPage = analysisStart + analysisPageSize < relatedAnalysisRows.length;

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
          <div className="text-sm text-slate-600">購入均價</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {formatCurrency(holding.average_cost, holding.cost_currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">平均購入價格</div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">持倉</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {formatNumber(holding.shares, 2)} 股
          </div>
          <div className="mt-1 text-xs text-slate-500">
            市值 {marketValue !== null ? formatCurrency(marketValue, holding.cost_currency) : "-"}
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

      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">交易流水</h2>
            <p className="mt-1 text-sm text-slate-500">買入、賣出與成本會由流水重新計算。</p>
          </div>
          <div className="flex items-center gap-2">
            <AddTransactionDialog
              holdingId={holding.id}
              defaultCurrency={holding.cost_currency as "TWD" | "USD"}
              transactionType="buy"
            />
            <AddTransactionDialog
              holdingId={holding.id}
              defaultCurrency={holding.cost_currency as "TWD" | "USD"}
              transactionType="sell"
            />
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>日期</Th>
              <Th>類型</Th>
              <Th className="text-right">股數</Th>
              <Th className="text-right">價格</Th>
              <Th className="text-right">手續費</Th>
              <Th className="text-right">金額</Th>
              <Th className="text-right">已實現損益</Th>
              <Th>備註</Th>
              <Th className="text-right">操作</Th>
            </tr>
          </thead>
          <tbody>
            {transactions.length ? (
              transactions.map((transaction) => {
                const amount = transaction.shares * transaction.price;
                const realizedPnl = realizedById.get(transaction.id) ?? null;
                const realizedClass =
                  realizedPnl === null
                    ? "text-slate-500"
                    : realizedPnl < 0
                      ? "text-red-700"
                      : "text-green-700";

                return (
                  <tr key={transaction.id}>
                    <Td>{transaction.trade_date}</Td>
                    <Td className={`font-medium ${transactionTypeClass(transaction.transaction_type)}`}>
                      {transactionTypeLabel(transaction.transaction_type)}
                    </Td>
                    <Td className="text-right">{formatNumber(transaction.shares, 2)}</Td>
                    <Td className="text-right">
                      {formatCurrency(transaction.price, transaction.currency)}
                    </Td>
                    <Td className="text-right">
                      {formatCurrency(transaction.fees, transaction.currency)}
                    </Td>
                    <Td className="text-right">{formatCurrency(amount, transaction.currency)}</Td>
                    <Td className={`text-right ${realizedClass}`}>
                      {realizedPnl === null
                        ? "-"
                        : `${formatSignedNumber(realizedPnl, 2)} ${transaction.currency}`}
                    </Td>
                    <Td className="max-w-xs truncate text-slate-600">{transaction.notes ?? "-"}</Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <EditTransactionDialog
                          transaction={transaction}
                          defaultCurrency={holding.cost_currency as "TWD" | "USD"}
                        />
                        <form action={deletePortfolioTransaction}>
                          <input type="hidden" name="holding_id" value={holding.id} />
                          <input type="hidden" name="id" value={transaction.id} />
                          <ConfirmSubmitButton idleLabel="刪除交易" confirmLabel="再次點擊確認刪除" />
                        </form>
                      </div>
                    </Td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <Td colSpan={9} className="py-8 text-center text-slate-500">
                  尚未建立交易流水。
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">團隊分析</h2>
          {relatedAnalysisRows.length > analysisPageSize ? (
            <div className="flex items-center gap-2 text-sm">
              {hasPreviousAnalysisPage ? (
                <Link
                  href={`/portfolio/${holding.id}?analysisPage=${analysisPage - 1}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  上一頁
                </Link>
              ) : null}
              <span className="text-xs text-slate-500">第 {analysisPage} 頁</span>
              {hasNextAnalysisPage ? (
                <Link
                  href={`/portfolio/${holding.id}?analysisPage=${analysisPage + 1}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  下一頁
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        {pagedAnalysisRows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>日期時間</Th>
                <Th>標題</Th>
                <Th>狀態</Th>
              </tr>
            </thead>
            <tbody>
              {pagedAnalysisRows.map((mission) => (
                <tr key={mission.id}>
                  <Td>{formatDateTime(mission.created_at)}</Td>
                  <Td>
                    <Link href={`/missions/${mission.id}`} className="font-medium text-blue-700 hover:underline">
                      {mission.title}
                    </Link>
                  </Td>
                  <Td>{mission.status}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-slate-500">目前沒有團隊分析紀錄。</p>
        )}
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
    </div>
  );
}
