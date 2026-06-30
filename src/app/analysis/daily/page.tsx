import Link from "next/link";
import { addMarketPickToWatchlist, refreshMarketDataForPage } from "@/app/actions";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDateTime, formatNumber, formatSignedNumber, formatSignedPercent } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Market = "TW" | "US";

type ScanPick = {
  symbol: string;
  name: string;
  market: Market;
  signal: "bull" | "bear" | "neutral";
  currentPrice: number;
  entryPoint: number;
  targetPrice: number;
  stopLoss: number;
  upsidePct: number;
  confidence: number;
  reason: string;
  volumeAlert: boolean;
};

type MarketAnalysisRow = {
  id: string;
  market: Market;
  sentiment: string | null;
  sentiment_reason: string | null;
  picks_under_50: unknown;
  picks_under_100: unknown;
  picks_under_200: unknown;
  etf_picks: unknown;
  created_at?: string | null;
};

type QuoteSnapshot = {
  price?: number;
  change?: number;
  changePct?: number;
  sourceUpdatedAt?: string;
};

type DataPackageSummary = {
  marketSnapshot?: {
    taiex?: QuoteSnapshot;
    sp500?: QuoteSnapshot;
    nasdaq?: QuoteSnapshot;
    vix?: QuoteSnapshot;
    usdTwd?: number;
  };
  upcomingEarnings?: Array<{
    symbol?: string;
    name?: string;
    date?: string;
    daysUntil?: number;
  }>;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asDataPackage(value: unknown): DataPackageSummary {
  return asRecord(value) as DataPackageSummary;
}

function asPickArray(value: unknown): ScanPick[] {
  return Array.isArray(value) ? (value as ScanPick[]) : [];
}

function sentimentLabel(sentiment: string | null | undefined) {
  if (sentiment === "bull") return "市場偏多";
  if (sentiment === "bear") return "市場偏空";
  return "市場中性";
}

function sentimentClass(sentiment: string | null | undefined) {
  if (sentiment === "bull") return "bg-green-100 text-green-800";
  if (sentiment === "bear") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function signalLabel(signal: string) {
  if (signal === "bull") return "做多";
  if (signal === "bear") return "偏空";
  return "觀察";
}

function signalClass(signal: string) {
  if (signal === "bull") return "bg-green-100 text-green-800";
  if (signal === "bear") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function IndexMiniCard({
  title,
  value,
  change,
  changePct
}: {
  title: string;
  value: string;
  change?: number | null;
  changePct?: number | null;
}) {
  const changeClass =
    change === null || change === undefined || change === 0
      ? "text-slate-500"
      : change > 0
        ? "text-green-700"
        : "text-red-700";

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
      {change !== undefined || changePct !== undefined ? (
        <div className={`mt-1 text-xs ${changeClass}`}>
          {change !== null && change !== undefined ? formatSignedNumber(change, 2) : "—"}{" "}
          {changePct !== null && changePct !== undefined ? formatSignedPercent(changePct) : ""}
        </div>
      ) : null}
    </div>
  );
}

function PickCard({ pick }: { pick: ScanPick }) {
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-950">{pick.symbol}</div>
          <div className="text-xs text-slate-500">{pick.name}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${signalClass(pick.signal)}`}>
          {signalLabel(pick.signal)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-slate-50 p-2">
          <div className="text-slate-500">現價</div>
          <div className="font-semibold text-slate-950">{formatNumber(pick.currentPrice, 2)}</div>
        </div>
        <div className="rounded-md bg-blue-50 p-2">
          <div className="text-slate-500">進場點</div>
          <div className="font-semibold text-blue-800">{formatNumber(pick.entryPoint, 2)}</div>
        </div>
        <div className="rounded-md bg-green-50 p-2">
          <div className="text-slate-500">目標價</div>
          <div className="font-semibold text-green-800">{formatNumber(pick.targetPrice, 2)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-red-600">停損 {formatNumber(pick.stopLoss, 2)}</span>
        <span className={pick.upsidePct >= 0 ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
          {pick.upsidePct >= 0 ? "+" : ""}
          {formatNumber(pick.upsidePct, 1)}% 空間
        </span>
        <span className="text-slate-500">信心 {pick.confidence}%</span>
      </div>

      {pick.volumeAlert ? (
        <div className="rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800">
          今日量能放大
        </div>
      ) : null}

      <p className="border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-600">
        {pick.reason}
      </p>

      <form action={addMarketPickToWatchlist}>
        <input type="hidden" name="symbol" value={pick.symbol} />
        <input type="hidden" name="market" value={pick.market} />
        <input type="hidden" name="name" value={pick.name} />
        <input type="hidden" name="targetPrice" value={String(pick.targetPrice)} />
        <input type="hidden" name="reason" value={pick.reason} />
        <PendingSubmitButton
          idleLabel="加入關注清單"
          pendingLabel="加入中..."
          variant="secondary"
          size="sm"
          className="w-full text-xs"
        />
      </form>
    </div>
  );
}

function EmptyAnalysis() {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
      尚未產生此區間推薦。請執行市場分析取得最新結果。
    </div>
  );
}

function PickSection({ title, picks }: { title: string; picks: ScanPick[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {picks.length === 0 ? (
        <EmptyAnalysis />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {picks.map((pick) => (
            <PickCard key={`${pick.market}-${pick.symbol}`} pick={pick} />
          ))}
        </div>
      )}
    </section>
  );
}

function buildUpcomingEvents(market: Market, dataPackage: DataPackageSummary) {
  const earnings = (dataPackage.upcomingEarnings ?? [])
    .filter((event) => (market === "US" ? !/^\d/.test(event.symbol ?? "") : /^\d/.test(event.symbol ?? "")))
    .slice(0, 3)
    .map((event) => ({
      title: `${event.symbol ?? ""} 財報`,
      detail: event.name ?? "",
      date: event.date ?? ""
    }));
  const recurring =
    market === "TW"
      ? [
          { title: "台灣出口數據", detail: "月度公布", date: "每月" },
          { title: "央行理監事會議", detail: "季度會議", date: "季度" }
        ]
      : [
          { title: "FOMC 會議", detail: "利率決策", date: "每6週" },
          { title: "CPI 通膨數據", detail: "月度公布", date: "每月" },
          { title: "非農就業報告", detail: "每月第一個週五", date: "每月" }
        ];

  return [...earnings, ...recurring].slice(0, 5);
}

export default async function DailyAnalysisPage({
  searchParams
}: {
  searchParams: { market?: string; updated?: string };
}) {
  const activeMarket: Market = searchParams.market === "US" ? "US" : "TW";
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const today = todayIsoDate();
  const { data: run } = await supabase
    .from("daily_runs")
    .select("id, status, run_date, data_package, created_at")
    .eq("user_id", user.id)
    .eq("run_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const runRecord = (run ?? null) as Record<string, unknown> | null;
  const dataPackage = asDataPackage(runRecord?.data_package);
  const snapshot = dataPackage.marketSnapshot ?? {};
  const { data: analysisData } = await supabase
    .from("market_analysis_runs")
    .select("*")
    .eq("user_id", user.id)
    .eq("market", activeMarket)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const analysisRow = (analysisData ?? null) as MarketAnalysisRow | null;
  const currency = activeMarket === "TW" ? "NT$" : "US$";
  const events = buildUpcomingEvents(activeMarket, dataPackage);
  const primaryIndex = activeMarket === "TW" ? snapshot.taiex : snapshot.sp500;
  const secondaryIndex = activeMarket === "TW" ? null : snapshot.nasdaq;
  const vix = snapshot.vix;
  const marketDataUpdatedAt = [primaryIndex?.sourceUpdatedAt, secondaryIndex?.sourceUpdatedAt, vix?.sourceUpdatedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">市場分析</h1>
          <p className="mt-1 text-sm text-slate-600">台灣與美國市場今日回顧與精選推薦。</p>
        </div>
        <div className="space-y-3 text-right">
          <div className="space-y-1">
            <RunAnalysisButton label="執行市場分析" />
            <p className="text-xs text-slate-500">
              上一次市場分析：{analysisRow?.created_at ? formatDateTime(analysisRow.created_at) : "—"}
            </p>
          </div>
          <form action={refreshMarketDataForPage}>
            <input type="hidden" name="returnTo" value={`/analysis/daily?market=${activeMarket}`} />
            <PendingSubmitButton
              idleLabel="更新市場資料"
              pendingLabel="更新中..."
              icon="refresh"
              variant="secondary"
            />
          </form>
          {searchParams.updated === "1" ? (
            <p className="text-xs text-green-700">市場資料已更新。</p>
          ) : null}
          <p className="text-xs text-slate-500">
            市場資料更新：{marketDataUpdatedAt ? formatDateTime(marketDataUpdatedAt) : "—"}
          </p>
        </div>
      </div>

      {runRecord?.status === "running" ? (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <AutoRefresh />
          <p className="text-sm text-slate-600">分析執行中，頁面每 10 秒自動更新。</p>
        </div>
      ) : null}

      {runRecord?.status === "failed" ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-5">
          <h2 className="text-lg font-semibold text-red-900">每日分析失敗</h2>
          <p className="mt-1 text-sm text-red-700">請檢查 API 用量頁的錯誤訊息後重新執行。</p>
        </div>
      ) : null}

      <div className="flex w-fit gap-1 rounded-md border border-slate-200 bg-slate-100 p-1">
        {[
          { market: "TW", label: "台灣市場" },
          { market: "US", label: "美國市場" }
        ].map((item) => (
          <Link
            key={item.market}
            href={`?market=${item.market}`}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeMarket === item.market
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600 hover:text-slate-950"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            {activeMarket === "TW" ? "台灣大盤" : "美國大盤"}
          </h2>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${sentimentClass(analysisRow?.sentiment)}`}>
            {sentimentLabel(analysisRow?.sentiment)}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {analysisRow?.sentiment_reason ?? "尚未產生今日市場情緒摘要。"}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <IndexMiniCard
            title={activeMarket === "TW" ? "加權指數" : "S&P 500"}
            value={primaryIndex?.price !== undefined ? formatNumber(primaryIndex.price, 2) : "—"}
            change={primaryIndex?.change ?? null}
            changePct={primaryIndex?.changePct ?? null}
          />
          {activeMarket === "TW" ? (
            <IndexMiniCard
              title="美元/台幣"
              value={snapshot.usdTwd !== undefined ? formatNumber(snapshot.usdTwd, 4) : "—"}
            />
          ) : (
            <IndexMiniCard
              title="NASDAQ"
              value={secondaryIndex?.price !== undefined ? formatNumber(secondaryIndex.price, 2) : "—"}
              change={secondaryIndex?.change ?? null}
              changePct={secondaryIndex?.changePct ?? null}
            />
          )}
          <IndexMiniCard
            title="VIX"
            value={vix?.price !== undefined ? formatNumber(vix.price, 2) : "—"}
            change={vix?.change ?? null}
            changePct={vix?.changePct ?? null}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-950">近期重要事項</h2>
        <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {events.map((event, index) => (
            <div key={`${event.title}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <span className="text-sm font-medium text-slate-950">{event.title}</span>
                {event.detail ? (
                  <span className="ml-2 text-xs text-slate-500">{event.detail}</span>
                ) : null}
              </div>
              <span className="text-xs font-medium text-slate-400">{event.date}</span>
            </div>
          ))}
        </div>
      </section>

      <PickSection
        title={`選股推薦 - ${currency}50 以下`}
        picks={asPickArray(analysisRow?.picks_under_50)}
      />
      <PickSection
        title={`選股推薦 - ${currency}100 以下`}
        picks={asPickArray(analysisRow?.picks_under_100)}
      />
      <PickSection
        title={`選股推薦 - ${currency}200 以下`}
        picks={asPickArray(analysisRow?.picks_under_200)}
      />
      <PickSection title="ETF 推薦" picks={asPickArray(analysisRow?.etf_picks)} />
    </div>
  );
}
