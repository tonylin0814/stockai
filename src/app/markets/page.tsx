import Image from "next/image";
import Link from "next/link";
import { BarChart3, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

const pageSize = 4;

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
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-6 rounded-sm bg-cover bg-center ring-1 ring-slate-200"
                style={{ backgroundImage: `url('${advisor.flag}')` }}
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

function paginationHref(params: { date?: string; market?: string; page: number }) {
  const search = new URLSearchParams();
  if (params.date) search.set("date", params.date);
  if (params.market && params.market !== "all") search.set("market", params.market);
  if (params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/markets?${query}` : "/markets";
}

export default async function MarketAnalysisHistoryPage({
  searchParams
}: {
  searchParams?: { date?: string; market?: string; page?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const selectedDate = String(searchParams?.date ?? "");
  const selectedMarket = String(searchParams?.market ?? "all");
  const currentPage = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = user
    ? supabase
        .from("stocks_market_analysis_runs")
        .select("id, market, sentiment, sentiment_reason, picks_under_50, picks_under_100, picks_under_200, etf_picks, created_at", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    : null;

  if (query && selectedDate) {
    query = query
      .gte("created_at", `${selectedDate}T00:00:00`)
      .lt("created_at", `${selectedDate}T23:59:59.999`);
  }

  if (query && (selectedMarket === "TW" || selectedMarket === "US")) {
    query = query.eq("market", selectedMarket);
  }

  const { data, error, count } = query
    ? await query.range(from, to)
    : { data: [], error: null };

  if (error) throw new Error(error.message);

  const reports = (data ?? []) as unknown as MarketAnalysisRow[];
  const totalCount = count ?? reports.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = Boolean(selectedDate || selectedMarket !== "all");
  const normalizedPage = Math.min(currentPage, totalPages);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700">
              <BarChart3 className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold text-slate-950">市場分析記錄</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">保留每一次台股與美股市場分析。</p>
        </div>

        <form className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">日期</span>
            <Input name="date" type="date" defaultValue={selectedDate} className="w-44" />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">市場</span>
            <Select name="market" defaultValue={selectedMarket} className="w-36">
              <option value="all">全部市場</option>
              <option value="TW">台股</option>
              <option value="US">美股</option>
            </Select>
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-800 hover:bg-blue-100"
          >
            檢索
          </button>
          {hasFilters ? (
            <Link
              href="/markets"
              aria-label="清空篩選"
              title="清空篩選"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </Link>
          ) : null}
        </form>
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <span>
          第 {normalizedPage} / {totalPages} 頁，共 {totalCount} 筆
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={paginationHref({ date: selectedDate, market: selectedMarket, page: Math.max(1, normalizedPage - 1) })}
            aria-disabled={normalizedPage <= 1}
            className={`inline-flex h-8 items-center rounded-md border px-3 font-medium ${
              normalizedPage <= 1
                ? "pointer-events-none border-slate-200 bg-slate-50 text-slate-400"
                : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            上一頁
          </Link>
          <Link
            href={paginationHref({ date: selectedDate, market: selectedMarket, page: Math.min(totalPages, normalizedPage + 1) })}
            aria-disabled={normalizedPage >= totalPages}
            className={`inline-flex h-8 items-center rounded-md border px-3 font-medium ${
              normalizedPage >= totalPages
                ? "pointer-events-none border-slate-200 bg-slate-50 text-slate-400"
                : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            下一頁
          </Link>
        </div>
      </div>
    </div>
  );
}
