import Image from "next/image";
import Link from "next/link";
import { formatDateTime, formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MarketPick = {
  symbol?: string;
  name?: string;
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
    return { name: "🇹🇼 Owen 委員 - Codex", image: "/advisors/owen.png", alt: "Owen" };
  }

  return { name: "🇺🇸 Sofia 委員 - Codex", image: "/advisors/sofia.png", alt: "Sofia" };
}

function MarketPickList({ title, picks }: { title: string; picks: MarketPick[] }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
      {picks.length ? (
        <div className="mt-3 space-y-3">
          {picks.slice(0, 5).map((pick, index) => (
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
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{pick.reason}</p>
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
            <h3 className="text-lg font-semibold text-slate-950">{advisor.name}</h3>
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

export default async function MarketAnalysisHistoryPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data, error } = user
    ? await supabase
        .from("stocks_market_analysis_runs")
        .select("id, market, sentiment, sentiment_reason, picks_under_50, picks_under_100, picks_under_200, etf_picks, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };

  if (error) throw new Error(error.message);

  const reports = (data ?? []) as unknown as MarketAnalysisRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">市場分析記錄</h1>
          <p className="mt-1 text-sm text-slate-600">保留每一次台股與美股市場分析。</p>
        </div>
        <Link
          href="/markets"
          className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          返回總覽
        </Link>
      </div>

      {reports.length ? (
        <div className="space-y-4">
          {reports.map((report) => (
            <MarketAnalysisCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
          目前沒有已保存的市場分析記錄。
        </div>
      )}
    </div>
  );
}
