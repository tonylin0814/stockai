import { Trash2 } from "lucide-react";
import { softDeleteHolding } from "@/app/actions";
import { AddHoldingDialog, EditHoldingDialog } from "@/app/portfolio/holding-dialogs";
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


export default async function PortfolioPage() {
  const supabase = createSupabaseServerClient();
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
  const [quotes, usdTwd] = await Promise.all([
    Promise.all(
      rows.map(async (holding) => {
        const security = holding.securities;

        if (!security) {
          return null;
        }

        return provider.getQuote(security.symbol, security.market as "US" | "TW");
      })
    ),
    provider.getFXRate("USD", "TWD")
  ]);
  const rowsWithQuotes: HoldingWithQuote[] = rows.map((holding, index) => ({
    ...holding,
    quote: quotes[index]
  }));
  const pricedRows = rowsWithQuotes.filter(
    (holding) => holding.quote && holding.quote.qualityState !== "missing"
  );
  const totalMarketValueTwd = pricedRows.reduce((total, holding) => {
    const quote = holding.quote!;
    const marketValue = holding.shares * quote.price;

    if (holding.cost_currency === "USD") {
      return total + marketValue * (usdTwd || 0);
    }

    return total + marketValue;
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
        <div className="flex items-center gap-2">
          <RunAnalysisButton redirectTo="/analysis/daily" />
          <AddHoldingDialog />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">總市值（TWD 換算）</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            {formatCurrency(totalMarketValueTwd, "TWD")}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">今日持股數</div>
          <div className="mt-1 text-xl font-semibold text-slate-950">{rows.length}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">資料時間</div>
          <div className="mt-1 text-sm font-medium text-slate-950">
            {latestTimestamp ? formatDateTime(latestTimestamp) : "—"}
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
            <Th>備註</Th>
            <Th>操作</Th>
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
                <tr key={holding.id}>
                  <Td>{holding.securities?.symbol}</Td>
                  <Td>{holding.securities?.name}</Td>
                  <Td>{holding.securities?.market}</Td>
                  <Td>{formatNumber(holding.shares, 4)}</Td>
                  <Td>{formatNumber(holding.average_cost, 2)}</Td>
                  <Td>{holding.cost_currency}</Td>
                  <Td>{holding.strategy}</Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span>{hasPrice ? formatNumber(quote.price, 2) : "—"}</span>
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
                  <Td>{holding.notes || "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <EditHoldingDialog holding={holding} />
                      <form action={softDeleteHolding}>
                        <input type="hidden" name="id" value={holding.id} />
                        <Button
                          type="submit"
                          variant="danger"
                          size="icon"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </Td>
                </tr>
              );
            })
          ) : (
            <tr>
              <Td colSpan={13} className="py-8 text-center text-slate-500">
                尚未建立持股。
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
