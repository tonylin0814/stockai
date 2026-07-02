import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { softDeleteHolding } from "@/app/actions";
import { AddHoldingDialog, EditHoldingDialog } from "@/app/portfolio/holding-dialogs";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MarketStatusDot } from "@/components/market-status-dot";
import { QualityBadge } from "@/components/quality-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  formatCurrency,
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

function signedCurrency(value: number, currency: string) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCurrency(value, currency)}`;
}

function valueClass(value: number) {
  if (value < 0) return "text-red-700";
  if (value > 0) return "text-green-700";
  return "text-slate-700";
}

function marketSummary(rows: HoldingWithQuote[], market: "TW" | "US") {
  const currency = market === "TW" ? "TWD" : "USD";
  const marketRows = rows.filter((holding) => holding.securities?.market === market);
  const pricedRows = marketRows.filter(
    (holding) => holding.quote && holding.quote.qualityState !== "missing"
  );
  const marketValue = pricedRows.reduce(
    (total, holding) => total + holding.shares * holding.quote!.price,
    0
  );
  const cost = pricedRows.reduce(
    (total, holding) => total + holding.shares * holding.average_cost,
    0
  );
  const pnl = marketValue - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : null;
  const dayChange = pricedRows.reduce(
    (total, holding) => total + holding.shares * holding.quote!.change,
    0
  );
  const previousValue = marketValue - dayChange;
  const dayChangePct = previousValue > 0 ? (dayChange / previousValue) * 100 : null;

  return {
    currency,
    count: marketRows.length,
    marketValue,
    pnl,
    pnlPct,
    dayChange,
    dayChangePct
  };
}

function PortfolioSummaryCard({
  title,
  summary
}: {
  title: string;
  summary: ReturnType<typeof marketSummary>;
}) {
  const todayLabel = title.includes("台股") ? "今日台股變動" : "今日美股變動";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">總股票</dt>
          <dd className="mt-1 font-semibold text-slate-950">{summary.count}</dd>
        </div>
        <div>
          <dt className="text-slate-500">總市值</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {formatCurrency(summary.marketValue, summary.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">總收益</dt>
          <dd className={`mt-1 font-semibold ${valueClass(summary.pnl)}`}>
            {signedCurrency(summary.pnl, summary.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">百分比</dt>
          <dd className={`mt-1 font-semibold ${valueClass(summary.pnl)}`}>
            {summary.pnlPct === null ? "-" : formatSignedPercent(summary.pnlPct)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-3">
        <div className="text-sm font-medium text-blue-900">{todayLabel}</div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-blue-700">金額變動</div>
            <div className={`mt-1 font-semibold ${valueClass(summary.dayChange)}`}>
              {signedCurrency(summary.dayChange, summary.currency)}
            </div>
          </div>
          <div>
            <div className="text-blue-700">百分比變動</div>
            <div className={`mt-1 font-semibold ${valueClass(summary.dayChange)}`}>
              {summary.dayChangePct === null ? "-" : formatSignedPercent(summary.dayChangePct)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function PortfolioPage({
  searchParams
}: {
  searchParams?: {
    updated?: string;
    page?: string;
    market?: string;
    symbol?: string;
    name?: string;
    dateFrom?: string;
    dateTo?: string;
  };
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
  const taiwanSummary = marketSummary(rowsWithQuotes, "TW");
  const usSummary = marketSummary(rowsWithQuotes, "US");
  const selectedMarket = searchParams?.market === "TW" || searchParams?.market === "US"
    ? searchParams.market
    : "";
  const symbolFilter = (searchParams?.symbol ?? "").trim().toUpperCase();
  const nameFilter = (searchParams?.name ?? "").trim().toLowerCase();
  const dateFrom = (searchParams?.dateFrom ?? "").trim();
  const dateTo = (searchParams?.dateTo ?? "").trim();
  const filteredRows = rowsWithQuotes.filter((holding) => {
    const security = holding.securities;
    if (selectedMarket && security?.market !== selectedMarket) return false;
    if (symbolFilter && !security?.symbol?.toUpperCase().includes(symbolFilter)) return false;
    if (nameFilter && !security?.name?.toLowerCase().includes(nameFilter)) return false;
    if (dateFrom && (!holding.opened_at || holding.opened_at < dateFrom)) return false;
    if (dateTo && (!holding.opened_at || holding.opened_at > dateTo)) return false;
    return true;
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(
    totalPages,
    Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1)
  );
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = filteredRows.slice(pageStart, pageStart + pageSize);
  const pageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (selectedMarket) params.set("market", selectedMarket);
    if (symbolFilter) params.set("symbol", symbolFilter);
    if (nameFilter) params.set("name", searchParams?.name ?? "");
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", String(page));
    return `/portfolio?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700">
              <BriefcaseBusiness className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold text-slate-950">我的投資</h1>
          </div>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioSummaryCard title="我的台股市值" summary={taiwanSummary} />
        <PortfolioSummaryCard title="我的美股市值" summary={usSummary} />
      </div>

      <form className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            日期起
            <Input name="dateFrom" type="date" defaultValue={dateFrom} />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            日期止
            <Input name="dateTo" type="date" defaultValue={dateTo} />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            市場
            <Select name="market" defaultValue={selectedMarket}>
              <option value="">全部</option>
              <option value="TW">台股</option>
              <option value="US">美股</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            名稱
            <Input name="name" defaultValue={searchParams?.name ?? ""} placeholder="股票名稱" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            代號
            <Input name="symbol" defaultValue={symbolFilter} placeholder="例如 NVDA" />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1">
              送出
            </Button>
            <Link
              href="/portfolio"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

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
            {pagedRows.length ? (
              pagedRows.map((holding) => {
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
                  沒有符合條件的持股。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredRows.length > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-slate-500">
            顯示 {pageStart + 1} - {Math.min(pageStart + pageSize, filteredRows.length)} 筆，共 {filteredRows.length} 筆
          </div>
          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={pageUrl(currentPage - 1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                上一頁
              </Link>
            ) : null}
            <span className="text-slate-500">
              第 {currentPage} / {totalPages} 頁
            </span>
            {currentPage < totalPages ? (
              <Link
                href={pageUrl(currentPage + 1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                下一頁
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
