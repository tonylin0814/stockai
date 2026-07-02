import Link from "next/link";
import { softDeleteHolding } from "@/app/actions";
import { AddHoldingDialog, EditHoldingDialog } from "@/app/portfolio/holding-dialogs";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MarketStatusDot } from "@/components/market-status-dot";
import { PortfolioStatusBar } from "@/components/portfolio-status-bar";
import { QualityBadge } from "@/components/quality-badge";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { Quote } from "@/lib/market-data/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Holding = {
  id: string;
  shares: number;
  average_cost: number;
  cost_currency: string;
  strategy: string | null;
  notes: string | null;
  opened_at: string | null;
  securities: {
    symbol: string;
    market: string;
    name: string;
    security_type: string;
  } | null;
};

type HoldingWithQuote = Holding & {
  quote: Quote | null;
};

function formatDollar(value: number) {
  return `$${formatNumber(value, 2)}`;
}

export default async function PortfolioPage({
  searchParams
}: {
  searchParams?: { updated?: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: holdings, error } = await supabase
    .from("stocks_portfolio_holdings")
    .select(
      "id, shares, average_cost, cost_currency, strategy, notes, opened_at, securities:stocks_securities(symbol, market, name, security_type)"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (holdings ?? []) as unknown as Holding[];
  const provider = getMarketDataProvider();
  const quotes = await Promise.all(
    rows.map(async (holding) => {
      const security = holding.securities;

      if (!security) {
        return null;
      }

      return provider.getQuote(security.symbol, security.market as "US" | "TW");
    })
  );
  const rowsWithQuotes: HoldingWithQuote[] = rows.map((holding, index) => ({
    ...holding,
    quote: quotes[index]
  }));
  const pricedRows = rowsWithQuotes.filter(
    (holding) => holding.quote && holding.quote.qualityState !== "missing"
  );
  const taiwanMarketValueTwd = pricedRows.reduce((total, holding) => {
    if (holding.securities?.market !== "TW") return total;
    return total + holding.shares * holding.quote!.price;
  }, 0);
  const usMarketValueUsd = pricedRows.reduce((total, holding) => {
    if (holding.securities?.market !== "US") return total;
    return total + holding.shares * holding.quote!.price;
  }, 0);
  const latestTimestamp = pricedRows
    .map((holding) => holding.quote!.sourceUpdatedAt)
    .sort()
    .at(-1);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">投資組合</h1>
          <p className="mt-1 text-sm text-slate-600">管理手動輸入的台股、美股與 ETF 持股。</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-3">
          <Link href="/portfolio/analysis">
            <Button type="button" variant="secondary">
              投資組合分析
            </Button>
          </Link>
          <AddHoldingDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">台股市值</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {formatCurrency(taiwanMarketValueTwd, "TWD")}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">美股市值</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {formatCurrency(usMarketValueUsd, "USD")}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">今日持股數</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">{rows.length}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">最後價格更新</div>
          <div className="mt-1 text-sm font-medium text-slate-950">
            {latestTimestamp ? formatDateTime(latestTimestamp) : "—"}
          </div>
          <div className="mt-1">
            <PortfolioStatusBar />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full table-fixed text-sm leading-6">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[16%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left font-semibold text-slate-800">
              <th className="px-3 py-3">代號</th>
              <th className="px-3 py-3">名稱</th>
              <th className="px-3 py-3">市場</th>
              <th className="px-3 py-3 text-right">股數</th>
              <th className="px-3 py-3 text-right">平均成本</th>
              <th className="px-3 py-3 text-right">現價</th>
              <th className="px-3 py-3 text-right">市值</th>
              <th className="px-3 py-3 text-right">未實現損益</th>
              <th className="px-3 py-3 text-right">報酬率</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithQuotes.length ? (
              rowsWithQuotes.map((holding) => {
                const quote = holding.quote;
                const hasPrice = quote && quote.qualityState !== "missing";
                const marketValue = hasPrice ? holding.shares * quote.price : null;
                const pnl = hasPrice
                  ? (quote.price - holding.average_cost) * holding.shares
                  : null;
                const returnPct =
                  hasPrice && holding.average_cost > 0
                    ? ((quote.price - holding.average_cost) / holding.average_cost) * 100
                    : null;
                const pnlClass =
                  pnl === null ? "text-slate-500" : pnl < 0 ? "text-red-700" : "text-green-700";

                return (
                  <tr key={holding.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 align-middle">
                      <Link
                        href={`/portfolio/${holding.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {holding.securities?.symbol}
                      </Link>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <Link
                        href={`/portfolio/${holding.id}`}
                        className="block truncate hover:text-blue-700"
                        title={holding.securities?.name ?? ""}
                      >
                        {holding.securities?.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center gap-1.5">
                        {holding.securities?.market ? (
                          <MarketStatusDot market={holding.securities.market as "US" | "TW"} />
                        ) : null}
                        <span>{holding.securities?.market}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right align-middle">{formatNumber(holding.shares, 2)}</td>
                    <td className="px-3 py-3 text-right align-middle">
                      {formatDollar(holding.average_cost)}
                    </td>
                    <td className="px-3 py-3 text-right align-middle">
                      <div className="flex flex-col items-end gap-1">
                        <span>{hasPrice ? formatDollar(quote.price) : "—"}</span>
                        <QualityBadge state={quote?.qualityState ?? "missing"} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right align-middle">
                      {marketValue === null
                        ? "—"
                        : formatCurrency(marketValue, holding.cost_currency)}
                    </td>
                    <td className={`px-3 py-3 text-right align-middle ${pnlClass}`}>
                      {pnl === null ? "—" : formatCurrency(pnl, holding.cost_currency)}
                    </td>
                    <td className={`px-3 py-3 text-right align-middle ${pnlClass}`}>
                      {returnPct === null ? "—" : formatSignedPercent(returnPct)}
                    </td>
                    <td className="px-3 py-3 text-right align-middle">
                      <div className="flex justify-end gap-1.5">
                        <EditHoldingDialog holding={holding} />
                        <form action={softDeleteHolding}>
                          <input type="hidden" name="id" value={holding.id} />
                          <ConfirmSubmitButton idleLabel="刪除" confirmLabel="再次點擊確認刪除" />
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  尚未建立持股。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
