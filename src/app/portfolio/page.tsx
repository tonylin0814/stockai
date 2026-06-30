import Link from "next/link";
import { softDeleteHolding } from "@/app/actions";
import { AddHoldingDialog, EditHoldingDialog } from "@/app/portfolio/holding-dialogs";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MarketStatusDot } from "@/components/market-status-dot";
import { PortfolioStatusBar } from "@/components/portfolio-status-bar";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { QualityBadge } from "@/components/quality-badge";
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

function formatMarketRef(quote: Quote): string | null {
  const parts: string[] = [];

  if (quote.dayHigh && quote.dayLow) {
    parts.push(`H ${formatNumber(quote.dayHigh, 2)} / L ${formatNumber(quote.dayLow, 2)}`);
  }

  if (quote.bid && quote.ask) {
    parts.push(`買 ${formatNumber(quote.bid, 2)} / 賣 ${formatNumber(quote.ask, 2)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function PortfolioPage({
  searchParams
}: {
  searchParams?: { updated?: string };
}) {
  const refreshedAt = new Date().toISOString();
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: holdings, error } = await supabase
    .from("portfolio_holdings")
    .select(
      "id, shares, average_cost, cost_currency, strategy, notes, opened_at, securities(symbol, market, name, security_type)"
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">投資組合</h1>
          <p className="mt-1 text-sm text-slate-600">管理手動輸入的台股、美股與 ETF 持股。</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-3">
          <div className="space-y-1 text-right">
            <RunAnalysisButton label="執行投資組合分析" redirectTo="/analysis/daily" />
            <p className="text-xs text-slate-500">
              上一次投資組合分析：{lastAnalysisAt ? formatDateTime(lastAnalysisAt) : "—"}
            </p>
          </div>
          <div className="space-y-1 text-right">
            {searchParams?.updated === "1" ? (
              <p className="text-xs text-green-700">市場資料已更新。</p>
            ) : null}
            <div className="space-y-0.5 text-xs text-slate-500">
              <p>本頁重新抓取：{formatDateTime(refreshedAt)}</p>
              <p>資料來源時間：{latestTimestamp ? formatDateTime(latestTimestamp) : "—"}</p>
            </div>
          </div>
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

      <Table>
        <thead>
          <tr>
            <Th>代號</Th>
            <Th>名稱</Th>
            <Th>市場</Th>
            <Th>股數</Th>
            <Th>平均成本</Th>
            <Th>幣別</Th>
            <Th>策略</Th>
            <Th>現價</Th>
            <Th>市值</Th>
            <Th>未實現損益</Th>
            <Th>報酬率</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {rowsWithQuotes.length ? (
            rowsWithQuotes.map((holding) => {
              const quote = holding.quote;
              const hasPrice = quote && quote.qualityState !== "missing";
              const marketRef = hasPrice ? formatMarketRef(quote) : null;
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
                <tr key={holding.id}>
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
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {holding.securities?.market ? (
                        <MarketStatusDot market={holding.securities.market as "US" | "TW"} />
                      ) : null}
                      <span>{holding.securities?.market}</span>
                    </div>
                  </Td>
                  <Td>{formatNumber(holding.shares, 4)}</Td>
                  <Td>{formatNumber(holding.average_cost, 2)}</Td>
                  <Td>{holding.cost_currency}</Td>
                  <Td>{holding.strategy}</Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span>{hasPrice ? formatNumber(quote.price, 2) : "—"}</span>
                      {marketRef ? (
                        <span className="text-xs text-slate-400">{marketRef}</span>
                      ) : null}
                      <QualityBadge state={quote?.qualityState ?? "missing"} />
                    </div>
                  </Td>
                  <Td>
                    {marketValue === null
                      ? "—"
                      : formatCurrency(marketValue, holding.cost_currency)}
                  </Td>
                  <Td className={pnlClass}>
                    {pnl === null ? "—" : formatCurrency(pnl, holding.cost_currency)}
                  </Td>
                  <Td className={pnlClass}>
                    {returnPct === null ? "—" : formatSignedPercent(returnPct)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <EditHoldingDialog holding={holding} />
                      <form action={softDeleteHolding}>
                        <input type="hidden" name="id" value={holding.id} />
                        <ConfirmSubmitButton idleLabel="刪除" confirmLabel="再次點擊確認刪除" />
                      </form>
                    </div>
                  </Td>
                </tr>
              );
            })
          ) : (
            <tr>
              <Td colSpan={12} className="py-8 text-center text-slate-500">
                尚未建立持股。
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
