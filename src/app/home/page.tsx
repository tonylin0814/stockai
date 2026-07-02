import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  FileText,
  Landmark,
  PieChart,
  Star,
  type LucideIcon
} from "lucide-react";
import { QualityBadge } from "@/components/quality-badge";
import { Table, Td, Th } from "@/components/ui/table";
import {
  formatDateTime,
  formatNumber,
  formatSignedNumber,
  formatSignedPercent
} from "@/lib/format";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import type { Quote } from "@/lib/market-data/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HoldingRow = {
  id: string;
  shares: number;
  average_cost: number;
  securities: { symbol: string; market: string; name: string } | null;
};

type WatchlistRow = {
  id: string;
  target_buy_price: number | null;
  reason: string | null;
  securities: { symbol: string; market: string; name: string } | null;
};

type FxPair = { label: string; base: string; quote: string };

type MarketPick = {
  symbol?: string;
  name?: string;
  market?: string;
  price?: number;
  reason?: string;
  confidence?: number;
};

type MarketAnalysisRow = {
  id: string;
  market: "TW" | "US";
  sentiment: string | null;
  sentiment_reason: string | null;
  picks_under_50: unknown;
  picks_under_100: unknown;
  picks_under_200: unknown;
  etf_picks: unknown;
  created_at: string;
};

function signClass(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "";
  return value < 0 ? "text-red-700" : "text-green-700";
}

function isMarket(value: string | undefined): value is "US" | "TW" {
  return value === "US" || value === "TW";
}

function sentimentLabel(value: string | null) {
  if (value === "bull") return "偏多";
  if (value === "bear") return "偏空";
  if (value === "neutral") return "中性";
  return "未標示";
}

function sentimentClass(value: string | null) {
  if (value === "bull") return "border-green-200 bg-green-50 text-green-800";
  if (value === "bear") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function asMarketPicks(value: unknown): MarketPick[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (item && typeof item === "object" ? (item as MarketPick) : null))
    .filter((item): item is MarketPick => Boolean(item));
}

function marketAdvisor(market: "TW" | "US") {
  if (market === "TW") {
    return { name: "Owen 委員 - Codex", image: "/advisors/owen.png", alt: "Owen", flag: "/flags/tw.svg" };
  }

  return { name: "Sofia 委員 - Codex", image: "/advisors/sofia.png", alt: "Sofia", flag: "/flags/us.svg" };
}

function SectionTitle({
  icon: Icon,
  title,
  tone = "blue"
}: {
  icon: LucideIcon;
  title: string;
  tone?: "blue" | "emerald" | "violet" | "amber" | "rose";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700"
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
    </div>
  );
}

function FlagPair({ base, quote }: { base: string; quote: string }) {
  const flags: Record<string, string> = {
    CAD: "/flags/ca.svg",
    CNY: "/flags/cn.svg",
    JPY: "/flags/jp.svg",
    TWD: "/flags/tw.svg",
    USD: "/flags/us.svg"
  };

  return (
    <span className="inline-flex items-center gap-1">
      {[base, quote].map((currency) => (
        <Image
          key={currency}
          src={flags[currency]}
          alt={currency}
          width={24}
          height={16}
          className="h-4 w-6 rounded-sm object-cover ring-1 ring-slate-200"
        />
      ))}
    </span>
  );
}

function MarketPickList({ title, picks }: { title: string; picks: MarketPick[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      {picks.length ? (
        <div className="mt-3 space-y-3">
          {picks.slice(0, 3).map((pick, index) => (
            <div key={`${pick.symbol ?? title}-${index}`} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-950">{pick.symbol ?? "-"}</span>
                {pick.name ? <span className="text-slate-500">{pick.name}</span> : null}
                {typeof pick.price === "number" ? (
                  <span className="text-xs text-slate-500">{formatNumber(pick.price, 2)}</span>
                ) : null}
                {typeof pick.confidence === "number" ? (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    信心 {pick.confidence}
                  </span>
                ) : null}
              </div>
              {pick.reason ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{pick.reason}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">沒有推薦項目。</p>
      )}
    </div>
  );
}

function MarketAnalysisCard({ report }: { report: MarketAnalysisRow }) {
  const under50 = asMarketPicks(report.picks_under_50);
  const under100 = asMarketPicks(report.picks_under_100);
  const under200 = asMarketPicks(report.picks_under_200);
  const etfs = asMarketPicks(report.etf_picks);
  const marketLabel = report.market === "TW" ? "台股市場分析" : "美股市場分析";
  const advisor = marketAdvisor(report.market);

  return (
    <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image
            src={advisor.image}
            alt={advisor.alt}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
          />
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Image
                src={advisor.flag}
                alt=""
                width={24}
                height={16}
                className="h-4 w-6 rounded-sm object-cover ring-1 ring-slate-200"
              />
              <span>{advisor.name}</span>
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {marketLabel} / {formatDateTime(report.created_at)}
            </p>
          </div>
        </div>
        <span className={`rounded-md border px-2 py-1 text-xs font-medium ${sentimentClass(report.sentiment)}`}>
          {sentimentLabel(report.sentiment)}
        </span>
      </div>

      {report.sentiment_reason ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {report.sentiment_reason}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <MarketPickList title={report.market === "TW" ? "50 元以下" : "50 美元以下"} picks={under50} />
        <MarketPickList title={report.market === "TW" ? "100 元以下" : "100 美元以下"} picks={under100} />
        <MarketPickList title={report.market === "TW" ? "200 元以下" : "200 美元以下"} picks={under200} />
        <MarketPickList title="ETF" picks={etfs} />
      </div>
    </article>
  );
}

function EmptyState({
  message,
  linkHref,
  linkLabel
}: {
  message: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      {message}{" "}
      <Link href={linkHref} className="text-blue-600 hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}

function IndexCard({ title, quote }: { title: string; quote: Quote }) {
  const isMissing = quote.qualityState === "missing";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        <QualityBadge state={quote.qualityState} />
      </div>
      <div className="text-2xl font-semibold text-slate-950">
        {isMissing ? "-" : formatNumber(quote.price, 2)}
      </div>
      <div className={`mt-2 flex items-center gap-3 text-sm ${signClass(quote.change)}`}>
        <span>{isMissing ? "-" : formatSignedNumber(quote.change, 2)}</span>
        <span>{isMissing ? "-" : formatSignedPercent(quote.changePct)}</span>
      </div>
      <div className="mt-2 text-xs text-slate-500">
        資料時間：{formatDateTime(quote.sourceUpdatedAt)}
      </div>
    </div>
  );
}

export default async function MarketsPage() {
  const supabase = createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  let holdings: HoldingRow[] = [];
  let watchlistItems: WatchlistRow[] = [];
  let marketReports: MarketAnalysisRow[] = [];

  if (user) {
    const [holdingsResult, watchlistResult, marketReportsResult] = await Promise.all([
      supabase
        .from("stocks_portfolio_holdings")
        .select("id, shares, average_cost, securities:stocks_securities(symbol, market, name)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("stocks_watchlist_items")
        .select("id, target_buy_price, reason, securities:stocks_securities(symbol, market, name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("stocks_market_analysis_runs")
        .select("id, market, sentiment, sentiment_reason, picks_under_50, picks_under_100, picks_under_200, etf_picks, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6)
    ]);

    holdings = (holdingsResult.data ?? []) as unknown as HoldingRow[];
    watchlistItems = (watchlistResult.data ?? []) as unknown as WatchlistRow[];
    const latestByMarket = new Map<string, MarketAnalysisRow>();
    for (const report of (marketReportsResult.data ?? []) as unknown as MarketAnalysisRow[]) {
      if (!latestByMarket.has(report.market)) {
        latestByMarket.set(report.market, report);
      }
    }
    marketReports = Array.from(latestByMarket.values());
  }

  const fxPairs: FxPair[] = [
    { label: "USD / CNY", base: "USD", quote: "CNY" },
    { label: "USD / TWD", base: "USD", quote: "TWD" },
    { label: "CAD / TWD", base: "CAD", quote: "TWD" },
    { label: "USD / JPY", base: "USD", quote: "JPY" },
    { label: "TWD / JPY", base: "TWD", quote: "JPY" }
  ];
  const provider = getMarketDataProvider();
  const [dow, nasdaq, taiex, ...rest] = await Promise.all([
    provider.getIndex("^DJI", "US"),
    provider.getIndex("^IXIC", "US"),
    provider.getIndex("TAIEX", "TW"),
    ...fxPairs.map((pair) => provider.getFXRate(pair.base, pair.quote)),
    ...holdings.map((holding) =>
      holding.securities && isMarket(holding.securities.market)
        ? provider.getQuote(holding.securities.symbol, holding.securities.market)
        : Promise.resolve(null)
    ),
    ...watchlistItems.map((item) =>
      item.securities && isMarket(item.securities.market)
        ? provider.getQuote(item.securities.symbol, item.securities.market)
        : Promise.resolve(null)
    )
  ]);
  const fxRates = rest.slice(0, fxPairs.length) as number[];
  const holdingQuotes = rest.slice(
    fxPairs.length,
    fxPairs.length + holdings.length
  ) as (Quote | null)[];
  const watchQuotes = rest.slice(fxPairs.length + holdings.length) as (Quote | null)[];

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700">
            <BarChart3 className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold text-slate-950">市場總覽</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">持股、關注清單、匯率與大盤指數。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <IndexCard title="Dow Jones" quote={dow} />
        <IndexCard title="Nasdaq" quote={nasdaq} />
        <IndexCard title="TAIEX" quote={taiex} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={FileText} title="市場分析報告" tone="emerald" />
          <Link
            href="/markets"
            className="inline-flex h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            查看全部記錄
          </Link>
        </div>
        {marketReports.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {marketReports.map((report) => (
              <MarketAnalysisCard key={report.id} report={report} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
            目前沒有已保存的市場分析報告。
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle icon={Landmark} title="匯率" tone="violet" />
        <div className="grid gap-3 md:grid-cols-5">
          {fxPairs.map((pair, index) => (
            <div key={pair.label} className="rounded-md border border-violet-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FlagPair base={pair.base} quote={pair.quote} />
                <span>{pair.label}</span>
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-950">
                {Number.isFinite(fxRates[index]) ? formatNumber(fxRates[index], 4) : "-"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={PieChart} title="我的持股" tone="amber" />
        {holdings.length === 0 ? (
          <EmptyState message="尚未建立持股。" linkHref="/portfolio" linkLabel="前往投資組合新增" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>代號</Th>
                <Th>名稱</Th>
                <Th>市場</Th>
                <Th>現價</Th>
                <Th>今日漲跌</Th>
                <Th>今日漲跌%</Th>
                <Th>成本</Th>
                <Th>未實現損益</Th>
                <Th>報酬率</Th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding, index) => {
                const quote = holdingQuotes[index];
                const price = quote?.qualityState !== "missing" ? (quote?.price ?? null) : null;
                const costTotal = holding.average_cost * holding.shares;
                const marketValue = price !== null ? price * holding.shares : null;
                const pnl = marketValue !== null ? marketValue - costTotal : null;
                const returnPct = pnl !== null && costTotal > 0 ? (pnl / costTotal) * 100 : null;

                return (
                  <tr key={holding.id}>
                    <Td>
                      <Link href={`/portfolio/${holding.id}`} className="font-medium text-blue-700 hover:underline">
                        {holding.securities?.symbol ?? "-"}
                      </Link>
                    </Td>
                    <Td>{holding.securities?.name ?? "-"}</Td>
                    <Td>{holding.securities?.market ?? "-"}</Td>
                    <Td>{price !== null ? formatNumber(price, 2) : "-"}</Td>
                    <Td className={signClass(quote?.change)}>
                      {quote && quote.qualityState !== "missing" ? formatSignedNumber(quote.change, 2) : "-"}
                    </Td>
                    <Td className={signClass(quote?.changePct)}>
                      {quote && quote.qualityState !== "missing" ? formatSignedPercent(quote.changePct) : "-"}
                    </Td>
                    <Td>{formatNumber(holding.average_cost, 2)}</Td>
                    <Td className={signClass(pnl)}>
                      {pnl !== null ? formatSignedNumber(pnl, 2) : "-"}
                    </Td>
                    <Td className={signClass(returnPct)}>
                      {returnPct !== null ? formatSignedPercent(returnPct) : "-"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle icon={Star} title="關注清單" tone="rose" />
        {watchlistItems.length === 0 ? (
          <EmptyState message="尚未建立關注項目。" linkHref="/watchlist" linkLabel="前往關注清單新增" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>代號</Th>
                <Th>名稱</Th>
                <Th>市場</Th>
                <Th>現價</Th>
                <Th>今日漲跌</Th>
                <Th>今日漲跌%</Th>
                <Th>目標買進價</Th>
                <Th>理由</Th>
              </tr>
            </thead>
            <tbody>
              {watchlistItems.map((item, index) => {
                const quote = watchQuotes[index];
                const price = quote?.qualityState !== "missing" ? (quote?.price ?? null) : null;

                return (
                  <tr key={item.id}>
                    <Td>
                      <Link href={`/watchlist/${item.id}`} className="font-medium text-blue-700 hover:underline">
                        {item.securities?.symbol ?? "-"}
                      </Link>
                    </Td>
                    <Td>{item.securities?.name ?? "-"}</Td>
                    <Td>{item.securities?.market ?? "-"}</Td>
                    <Td>{price !== null ? formatNumber(price, 2) : "-"}</Td>
                    <Td className={signClass(quote?.change)}>
                      {quote && quote.qualityState !== "missing" ? formatSignedNumber(quote.change, 2) : "-"}
                    </Td>
                    <Td className={signClass(quote?.changePct)}>
                      {quote && quote.qualityState !== "missing" ? formatSignedPercent(quote.changePct) : "-"}
                    </Td>
                    <Td>{item.target_buy_price !== null ? formatNumber(item.target_buy_price, 2) : "-"}</Td>
                    <Td>{item.reason ?? "-"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
