import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatCurrency, formatDateTime, formatNumber, formatSignedPercent } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Trade = {
  id: string;
  action: string;
  symbol: string;
  market: "US" | "TW";
  name: string;
  shares: number;
  price_per_share: number;
  total_amount: number;
  thesis: string;
  technical_basis: string;
  fundamental_basis: string | null;
  risk_factors: string;
  target_price: number | null;
  stop_loss: number | null;
  conviction: number | null;
  outcome_pnl: number | null;
  outcome_pct: number | null;
  executed_at: string;
  ai_model: string | null;
  sim_portfolios: { division: "gpt" | "anthropic"; user_id: string } | null;
};

function divisionLabel(division?: string) {
  return division === "anthropic" ? "Anthropic Division" : "GPT Division";
}

function money(value: number, market: "US" | "TW") {
  return formatCurrency(value, market === "US" ? "USD" : "TWD");
}

export default async function TradeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("stocks_sim_trades")
    .select("*, sim_portfolios:stocks_sim_portfolios!inner(division, user_id)")
    .eq("id", params.id)
    .eq("sim_portfolios.user_id", user.id)
    .maybeSingle();
  const trade = data as unknown as Trade | null;

  if (!trade) {
    return (
      <div className="space-y-4">
        <Link href="/performance/simulation" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          回模擬交易
        </Link>
        <p className="text-sm text-slate-500">找不到這筆交易。</p>
      </div>
    );
  }

  const targetPct =
    trade.target_price && trade.price_per_share
      ? ((Number(trade.target_price) - Number(trade.price_per_share)) / Number(trade.price_per_share)) * 100
      : null;
  const stopPct =
    trade.stop_loss && trade.price_per_share
      ? ((Number(trade.stop_loss) - Number(trade.price_per_share)) / Number(trade.price_per_share)) * 100
      : null;

  return (
    <div className="space-y-6">
      <Link href="/performance/simulation" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" />
        回模擬交易
      </Link>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{formatDateTime(trade.executed_at)}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {divisionLabel(trade.sim_portfolios?.division)} — {trade.action === "buy" ? "買入" : "賣出"} {trade.symbol}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{trade.name}</p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
            信心指數：{trade.conviction === null ? "—" : `${formatNumber(Number(trade.conviction), 0)} / 100`}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-slate-500">成交</p>
            <p className="font-semibold text-slate-950">
              {money(Number(trade.price_per_share), trade.market)} × {formatNumber(Number(trade.shares), 2)}股
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">金額</p>
            <p className="font-semibold text-slate-950">{money(Number(trade.total_amount), trade.market)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">目標價</p>
            <p className="font-semibold text-slate-950">
              {trade.target_price === null ? "—" : `${money(Number(trade.target_price), trade.market)} (${formatSignedPercent(Number(targetPct ?? 0))})`}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">停損</p>
            <p className="font-semibold text-slate-950">
              {trade.stop_loss === null ? "—" : `${money(Number(trade.stop_loss), trade.market)} (${formatSignedPercent(Number(stopPct ?? 0))})`}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">投資論點</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{trade.thesis}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">技術分析</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{trade.technical_basis}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">基本面因素</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{trade.fundamental_basis ?? "模型未提供基本面補充。"}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">風險因素</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{trade.risk_factors}</p>
        </div>
      </section>

      {trade.outcome_pnl !== null ? (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">結果</h2>
          <p className={Number(trade.outcome_pnl) >= 0 ? "mt-2 text-sm text-green-700" : "mt-2 text-sm text-red-700"}>
            {money(Number(trade.outcome_pnl), trade.market)} / {formatSignedPercent(Number(trade.outcome_pct) * 100)}
          </p>
        </section>
      ) : null}
    </div>
  );
}
