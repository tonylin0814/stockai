import { Activity, BarChart3, Landmark } from "lucide-react";
import { QualityBadge } from "@/components/quality-badge";
import {
  formatDateTime,
  formatNumber,
  formatSignedNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { DataQualityState, Quote } from "@/lib/market-data/types";

type MarketCardData = {
  title: string;
  value: string;
  change: string;
  changePct: string;
  qualityState: DataQualityState;
  sourceUpdatedAt: string;
};

function quoteCard(title: string, quote: Quote): MarketCardData {
  return {
    title,
    value: quote.qualityState === "missing" ? "—" : formatNumber(quote.price, 2),
    change: quote.qualityState === "missing" ? "—" : formatSignedNumber(quote.change, 2),
    changePct: quote.qualityState === "missing" ? "—" : formatSignedPercent(quote.changePct),
    qualityState: quote.qualityState,
    sourceUpdatedAt: quote.sourceUpdatedAt
  };
}

function MarketCard({ item }: { item: MarketCardData }) {
  const changeIsNegative = item.change.startsWith("-");
  const changePctIsNegative = item.changePct.startsWith("-");

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-950">{item.title}</h3>
        <QualityBadge state={item.qualityState} />
      </div>
      <div className="text-2xl font-semibold text-slate-950">{item.value}</div>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <span className={changeIsNegative ? "text-red-700" : "text-green-700"}>
          {item.change}
        </span>
        <span className={changePctIsNegative ? "text-red-700" : "text-green-700"}>
          {item.changePct}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        更新時間：{formatDateTime(item.sourceUpdatedAt)}
      </p>
    </div>
  );
}

export default async function MarketsPage() {
  const provider = getMarketDataProvider();
  const [sp500, nasdaq, dow, vix, taiex, usdTwd, dgs10] = await Promise.all([
    provider.getIndex("^GSPC", "US"),
    provider.getIndex("^IXIC", "US"),
    provider.getIndex("^DJI", "US"),
    provider.getIndex("^VIX", "US"),
    provider.getIndex("TAIEX", "TW"),
    provider.getFXRate("USD", "TWD"),
    provider.getMacro("DGS10")
  ]);

  const latestYield = dgs10[0];
  const previousYield = dgs10[1];
  const yieldValue = latestYield?.value ?? 0;
  const yieldChange = previousYield ? yieldValue - previousYield.value : 0;
  const yieldCard: MarketCardData = {
    title: "美國 10 年期公債殖利率",
    value: latestYield ? `${formatNumber(yieldValue, 2)}%` : "—",
    change: latestYield ? formatSignedNumber(yieldChange, 2) : "—",
    changePct: "—",
    qualityState: latestYield ? "delayed" : "missing",
    sourceUpdatedAt: latestYield
      ? new Date(`${latestYield.date}T00:00:00Z`).toISOString()
      : new Date().toISOString()
  };
  const fxCard: MarketCardData = {
    title: "美元 / 台幣",
    value: usdTwd ? formatNumber(usdTwd, 4) : "—",
    change: "—",
    changePct: "—",
    qualityState: usdTwd ? "delayed" : "missing",
    sourceUpdatedAt: new Date().toISOString()
  };
  const taiwanItems = [quoteCard("加權指數", taiex), fxCard];
  const usItems = [
    quoteCard("S&P 500", sp500),
    quoteCard("NASDAQ", nasdaq),
    quoteCard("Dow Jones", dow),
    quoteCard("VIX", vix),
    yieldCard
  ];
  const allItems = [...taiwanItems, ...usItems];

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-slate-700">
          <Activity className="h-5 w-5" />
          <span className="text-sm font-medium">市場摘要</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">市場</h1>
        <p className="mt-1 text-sm text-slate-600">台股、美股、匯率與總經指標。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {allItems.map((item) => (
          <MarketCard key={item.title} item={item} />
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-slate-700" />
          <h2 className="text-xl font-semibold text-slate-950">台股</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {taiwanItems.map((item) => (
            <MarketCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-slate-700" />
          <h2 className="text-xl font-semibold text-slate-950">美股</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {usItems.map((item) => (
            <MarketCard key={item.title} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
