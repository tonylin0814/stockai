import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatNumber, formatSignedPercent } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PaperTrade = {
  id: string;
  direction: string;
  entry_date: string;
  entry_price: number;
  shares: number;
  target_price: number | null;
  stop_loss: number | null;
  exit_date: string | null;
  exit_price: number | null;
  return_pct: number | null;
  status: string;
  securities: { symbol: string; market: string } | null;
};

const statusLabel: Record<string, string> = {
  open: "持有中",
  closed: "已平倉",
  target_hit: "達目標",
  stop_hit: "停損"
};

function TradeTable({ trades, showAction }: { trades: PaperTrade[]; showAction: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>標的</Th>
          <Th>方向</Th>
          <Th>進場日</Th>
          <Th>進場價</Th>
          <Th>股數</Th>
          <Th>目標</Th>
          <Th>停損</Th>
          <Th>出場</Th>
          <Th>報酬</Th>
          <Th>狀態</Th>
          {showAction ? <Th>操作</Th> : null}
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr key={trade.id}>
            <Td>{trade.securities?.symbol ?? "—"} / {trade.securities?.market ?? "—"}</Td>
            <Td>{trade.direction === "long" ? "做多" : "做空"}</Td>
            <Td>{trade.entry_date}</Td>
            <Td>{formatNumber(trade.entry_price, 2)}</Td>
            <Td>{formatNumber(trade.shares, 2)}</Td>
            <Td>{trade.target_price === null ? "—" : formatNumber(trade.target_price, 2)}</Td>
            <Td>{trade.stop_loss === null ? "—" : formatNumber(trade.stop_loss, 2)}</Td>
            <Td>{trade.exit_price === null ? "—" : formatNumber(trade.exit_price, 2)}</Td>
            <Td className={trade.return_pct === null ? "" : trade.return_pct >= 0 ? "text-green-700" : "text-red-700"}>
              {trade.return_pct === null ? "—" : formatSignedPercent(trade.return_pct)}
            </Td>
            <Td>{statusLabel[trade.status] ?? trade.status}</Td>
            {showAction ? (
              <Td>
                <Link href={`/paper-trades/${trade.id}/close`}>
                  <Button type="button" variant="secondary" size="sm">平倉</Button>
                </Link>
              </Td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default async function PaperTradesPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("paper_trades")
    .select("id, direction, entry_date, entry_price, shares, target_price, stop_loss, exit_date, exit_price, return_pct, status, securities(symbol, market)")
    .eq("user_id", user.id)
    .order("entry_date", { ascending: false });
  const trades = (data ?? []) as unknown as PaperTrade[];
  const open = trades.filter((trade) => trade.status === "open");
  const closed = trades.filter((trade) => trade.status !== "open");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-950">模擬交易</h1>
        <Link href="/paper-trades/new">
          <Button type="button" size="sm">
            <Plus className="h-4 w-4" />
            新增
          </Button>
        </Link>
      </div>

      {open.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-700">持有中</h2>
          <TradeTable trades={open} showAction />
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-700">已結束</h2>
          <TradeTable trades={closed} showAction={false} />
        </section>
      ) : null}

      {trades.length === 0 ? <p className="text-sm text-slate-500">尚無模擬交易記錄。</p> : null}
    </div>
  );
}
