# Codex Prompt 29 — Market Analysis Page: Full Redesign

**Goal**: Replace the current "每日分析" page (committee decisions, division tables, team reports — all internal AI plumbing) with a clean "市場分析" page that shows market context, what's coming, and actionable stock/ETF picks by price tier — in two tabs: 台灣 and 美國.

**Apply after**: Prompts 01–28 applied (Prompt 28 sets up `daily_scan_picks` table and `TwScanPick` type).

**Depends on**: `daily_scan_picks` table from Prompt 28 migration.

---

## What gets removed from the page

Remove these sections entirely from `src/app/analysis/daily/page.tsx`:
- 委員會決策 section
- Division 比較 section  
- Team Reports section
- 今日建議 table (the raw recommendations dump)

The backend pipeline still runs — those results are used by individual portfolio holding pages. We just stop showing the internal AI process on this page.

---

## New page structure

```
市場分析                              [執行分析 button]

[  台灣市場  ] [  美國市場  ]          ← tab switcher

── Tab: 台灣市場 ──────────────────────────────────────

📊 大盤回顧
   加權指數 | 今收/昨收 | 漲跌 | 漲跌% | 成交量
   市場情緒: 🐂 偏多 / 🐻 偏空 / ➡️ 中性   (derived from VIX + index vs SMA)

🗓️ 近期重要事項
   • 財報: [symbol] [date]
   • 台灣出口數據 [date]  
   • 央行理監事會議 [date]

💡 選股推薦
   ─ NT$50 以下 ─
   [Card] [Card] [Card]
   ─ NT$100 以下 ─
   [Card] [Card] [Card]
   ─ NT$200 以下 ─
   [Card] [Card] [Card]

📦 ETF 推薦
   [Card] [Card] [Card]

── Tab: 美國市場 ──────────────────────────────────────
(same structure, USD price tiers $50 / $100 / $200)
```

---

## Step 1: Extend scan universe for price tiers

### File: `src/lib/analysis/tw-universe.ts` (created by Prompt 28)

Extend to include stocks across price ranges. Add two new exports:

```typescript
// Stocks that typically trade UNDER NT$50 — financials, steel, display panels
export const TW_UNIVERSE_UNDER_50: Array<{ symbol: string; name: string }> = [
  { symbol: "2880", name: "華南金" },
  { symbol: "2892", name: "第一金" },
  { symbol: "2884", name: "玉山金" },
  { symbol: "2891", name: "中信金" },
  { symbol: "5880", name: "合庫金" },
  { symbol: "2886", name: "兆豐金" },
  { symbol: "2890", name: "永豐金" },
  { symbol: "2883", name: "開發金" },
  { symbol: "2002", name: "中鋼" },
  { symbol: "2409", name: "友達" },
  { symbol: "3481", name: "群創" },
  { symbol: "2408", name: "南亞科" },
  { symbol: "1326", name: "台化" },
  { symbol: "2324", name: "仁寶" },
  { symbol: "2352", name: "佳世達" },
  { symbol: "2356", name: "英業達" },
  { symbol: "3045", name: "台灣大" },  // may be near 50
  { symbol: "4904", name: "遠傳" },
  { symbol: "2801", name: "彰化銀行" },
  { symbol: "5876", name: "上海商銀" },
];

// Stocks that typically trade NT$50–100
export const TW_UNIVERSE_50_TO_100: Array<{ symbol: string; name: string }> = [
  { symbol: "2882", name: "國泰金" },
  { symbol: "2881", name: "富邦金" },
  { symbol: "1303", name: "南亞" },
  { symbol: "1301", name: "台塑" },
  { symbol: "6505", name: "台塑化" },
  { symbol: "2353", name: "宏碁" },
  { symbol: "2317", name: "鴻海" },
  { symbol: "2357", name: "華碩" },
  { symbol: "2382", name: "廣達" },
  { symbol: "2308", name: "台達電" },
  { symbol: "2303", name: "聯電" },
  { symbol: "2207", name: "和泰車" },
  { symbol: "2912", name: "統一超" },
  { symbol: "1216", name: "統一企業" },
  { symbol: "9910", name: "豐泰" },
];

// Stocks that typically trade NT$100–200
export const TW_UNIVERSE_100_TO_200: Array<{ symbol: string; name: string }> = [
  { symbol: "2379", name: "瑞昱" },
  { symbol: "3008", name: "大立光" },   // actually very high — filter at runtime
  { symbol: "2395", name: "研華" },
  { symbol: "6415", name: "矽力-KY" },
  { symbol: "2327", name: "國巨" },
  { symbol: "4938", name: "和碩" },
  { symbol: "3711", name: "日月光投控" },
  { symbol: "2376", name: "技嘉" },
  { symbol: "2385", name: "群光" },
  { symbol: "5347", name: "世界先進" },
];

// TW ETFs
export const TW_ETF_UNIVERSE: Array<{ symbol: string; name: string }> = [
  { symbol: "0050",  name: "元大台灣50" },
  { symbol: "0056",  name: "元大高股息" },
  { symbol: "00878", name: "國泰永續高股息" },
  { symbol: "006208", name: "富邦台50" },
  { symbol: "00919", name: "群益台灣精選高息" },
  { symbol: "00929", name: "復華台灣科技優息" },
  { symbol: "00881", name: "國泰台灣5G+" },
  { symbol: "00692", name: "富邦公司治理" },
];
```

Also add a US universe:

### File: `src/lib/analysis/us-universe.ts` (NEW)

```typescript
export const US_UNIVERSE_UNDER_50: Array<{ symbol: string; name: string }> = [
  { symbol: "F",    name: "Ford" },
  { symbol: "BAC",  name: "Bank of America" },
  { symbol: "T",    name: "AT&T" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "WBA",  name: "Walgreens" },
  { symbol: "KMI",  name: "Kinder Morgan" },
  { symbol: "VALE", name: "Vale" },
  { symbol: "PFE",  name: "Pfizer" },
  { symbol: "MARA", name: "Marathon Digital" },
  { symbol: "SOFI", name: "SoFi Technologies" },
  { symbol: "PLTR", name: "Palantir" },   // may exceed $50 — filter at runtime
  { symbol: "NIO",  name: "NIO" },
  { symbol: "LCID", name: "Lucid Group" },
  { symbol: "RIVN", name: "Rivian" },
  { symbol: "AAL",  name: "American Airlines" },
  { symbol: "CCL",  name: "Carnival" },
  { symbol: "X",    name: "U.S. Steel" },
  { symbol: "GRAB", name: "Grab Holdings" },
];

export const US_UNIVERSE_50_TO_100: Array<{ symbol: string; name: string }> = [
  { symbol: "DIS",  name: "Disney" },
  { symbol: "PYPL", name: "PayPal" },
  { symbol: "C",    name: "Citigroup" },
  { symbol: "WFC",  name: "Wells Fargo" },
  { symbol: "GM",   name: "General Motors" },
  { symbol: "UBER", name: "Uber" },
  { symbol: "SNAP", name: "Snap" },
  { symbol: "RBLX", name: "Roblox" },
  { symbol: "SQ",   name: "Block (Square)" },
  { symbol: "DKNG", name: "DraftKings" },
  { symbol: "U",    name: "Unity Software" },
  { symbol: "PINS", name: "Pinterest" },
  { symbol: "HOOD", name: "Robinhood" },
  { symbol: "PATH", name: "UiPath" },
];

export const US_UNIVERSE_100_TO_200: Array<{ symbol: string; name: string }> = [
  { symbol: "NFLX", name: "Netflix" },    // may exceed $200 — filter at runtime
  { symbol: "SHOP", name: "Shopify" },
  { symbol: "COIN", name: "Coinbase" },
  { symbol: "ROKU", name: "Roku" },
  { symbol: "TWLO", name: "Twilio" },
  { symbol: "DDOG", name: "Datadog" },
  { symbol: "NET",  name: "Cloudflare" },
  { symbol: "ZS",   name: "Zscaler" },
  { symbol: "SNOW", name: "Snowflake" },
  { symbol: "ARM",  name: "Arm Holdings" },
  { symbol: "MDB",  name: "MongoDB" },
  { symbol: "PANW", name: "Palo Alto Networks" },
];

export const US_ETF_UNIVERSE: Array<{ symbol: string; name: string }> = [
  { symbol: "SPY",  name: "S&P 500 ETF" },
  { symbol: "QQQ",  name: "NASDAQ 100 ETF" },
  { symbol: "VTI",  name: "Total Market ETF" },
  { symbol: "SCHD", name: "Dividend ETF" },
  { symbol: "ARKK", name: "ARK Innovation ETF" },
  { symbol: "SOXL", name: "Semiconductor Bull 3x" },
  { symbol: "TLT",  name: "20+ Year Treasury ETF" },
  { symbol: "GLD",  name: "Gold ETF" },
  { symbol: "XLK",  name: "Tech Sector ETF" },
  { symbol: "JEPI", name: "JPMorgan Premium Income ETF" },
];
```

---

## Step 2: New scan pipeline for the full market analysis

### File: `src/lib/analysis/pipeline/market-analysis.ts` (NEW)

This runs ONE AI call per market (TW + US) and returns structured picks per price tier.

```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  TW_UNIVERSE_UNDER_50, TW_UNIVERSE_50_TO_100, TW_UNIVERSE_100_TO_200, TW_ETF_UNIVERSE,
} from "@/lib/analysis/tw-universe";
import {
  US_UNIVERSE_UNDER_50, US_UNIVERSE_50_TO_100, US_UNIVERSE_100_TO_200, US_ETF_UNIVERSE,
} from "@/lib/analysis/us-universe";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import { computeTechnicals } from "@/lib/analysis/indicators";

export type ScanPick = {
  symbol: string;
  name: string;
  market: "TW" | "US";
  signal: "bull" | "bear" | "neutral";
  currentPrice: number;
  entryPoint: number;    // ideal entry / buy zone low
  targetPrice: number;
  stopLoss: number;
  upsidePct: number;
  confidence: number;   // 0–100
  reason: string;       // ≤80 chars, must include real numbers
  volumeAlert: boolean; // true if today's volume > 1.5× average
};

export type MarketAnalysisResult = {
  market: "TW" | "US";
  sentiment: "bull" | "bear" | "neutral";
  sentimentReason: string;
  picksUnder50: ScanPick[];
  picksUnder100: ScanPick[];
  picksUnder200: ScanPick[];
  etfPicks: ScanPick[];
  runDate: string;
};
```

#### Fetch quotes for all universe stocks, then call AI

```typescript
export async function runMarketAnalysis(
  openaiClient: OpenAI,
  market: "TW" | "US",
  excludeSymbols: Set<string>,
  marketSnapshot: { indexPrice: number; indexChangePct: number; vix: number }
): Promise<MarketAnalysisResult> {
  const provider = getMarketDataProvider();

  // Select universe by market
  const under50List  = market === "TW" ? TW_UNIVERSE_UNDER_50  : US_UNIVERSE_UNDER_50;
  const mid100List   = market === "TW" ? TW_UNIVERSE_50_TO_100 : US_UNIVERSE_50_TO_100;
  const mid200List   = market === "TW" ? TW_UNIVERSE_100_TO_200 : US_UNIVERSE_100_TO_200;
  const etfList      = market === "TW" ? TW_ETF_UNIVERSE       : US_ETF_UNIVERSE;

  const allCandidates = [...under50List, ...mid100List, ...mid200List, ...etfList]
    .filter(c => !excludeSymbols.has(c.symbol));

  // Fetch quotes and 90d history in parallel
  const [quotes, histories] = await Promise.all([
    Promise.all(allCandidates.map(c => provider.getQuote(c.symbol, market).catch(() => null))),
    Promise.all(allCandidates.map(c => provider.getHistory(c.symbol, market, 90).catch(() => []))),
  ]);

  // Build enriched candidate list with technicals + actual price for tier filtering
  type EnrichedCandidate = {
    symbol: string; name: string; price: number; change: number; changePct: number;
    volume: number | null; avgVolume: number | null;
    sma20: number | null; sma60: number | null; rsi14: number | null;
    weekHigh52: number | null; weekLow52: number | null;
    volumeAlert: boolean;
  };

  const enriched: EnrichedCandidate[] = allCandidates.flatMap((c, i) => {
    const q = quotes[i];
    if (!q || q.qualityState === "missing" || !q.price) return [];
    const tech = computeTechnicals(histories[i] ?? []);
    const avgVol = tech.avgVolume ?? null;
    const todayVol = q.volume ?? null;
    return [{
      symbol: c.symbol, name: c.name,
      price: q.price, change: q.change, changePct: q.changePct,
      volume: todayVol, avgVolume: avgVol,
      sma20: tech.sma20 ?? null, sma60: tech.sma60 ?? null,
      rsi14: tech.rsi14 ?? null,
      weekHigh52: q.weekHigh52 ?? null, weekLow52: q.weekLow52 ?? null,
      volumeAlert: !!(todayVol && avgVol && todayVol > avgVol * 1.5),
    }];
  });

  // Split by actual price tier (strict — only stocks actually under the limit)
  const currency = market === "TW" ? "NT$" : "USD";
  const tier50  = enriched.filter(c => !etfList.some(e => e.symbol === c.symbol) && c.price < 50);
  const tier100 = enriched.filter(c => !etfList.some(e => e.symbol === c.symbol) && c.price >= 50 && c.price < 100);
  const tier200 = enriched.filter(c => !etfList.some(e => e.symbol === c.symbol) && c.price >= 100 && c.price < 200);
  const etfs    = enriched.filter(c => etfList.some(e => e.symbol === c.symbol));

  // Build prompt
  const prompt = buildMarketAnalysisPrompt(market, currency, marketSnapshot, { tier50, tier100, tier200, etfs });

  // Call AI
  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 3000,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const json = JSON.parse(raw);

  return {
    market,
    sentiment: json.sentiment ?? "neutral",
    sentimentReason: json.sentimentReason ?? "",
    picksUnder50:  (json.picksUnder50  ?? []).slice(0, 3),
    picksUnder100: (json.picksUnder100 ?? []).slice(0, 3),
    picksUnder200: (json.picksUnder200 ?? []).slice(0, 3),
    etfPicks:      (json.etfPicks      ?? []).slice(0, 3),
    runDate: new Date().toISOString(),
  };
}
```

---

## Step 3: AI prompt for market analysis picks

### File: `src/lib/analysis/prompts/market-analysis.ts` (NEW)

```typescript
export function buildMarketAnalysisPrompt(
  market: "TW" | "US",
  currency: string,
  marketSnapshot: { indexPrice: number; indexChangePct: number; vix: number },
  tiers: {
    tier50: EnrichedCandidate[];
    tier100: EnrichedCandidate[];
    tier200: EnrichedCandidate[];
    etfs: EnrichedCandidate[];
  }
): string {
  function formatTier(candidates: EnrichedCandidate[]): string {
    if (!candidates.length) return "（無資料）";
    return candidates.map(c => {
      const chg = `${c.changePct >= 0 ? "+" : ""}${c.changePct.toFixed(2)}%`;
      const sma = [c.sma20 && `SMA20:${c.sma20.toFixed(1)}`, c.sma60 && `SMA60:${c.sma60.toFixed(1)}`].filter(Boolean).join(" ");
      const rsi = c.rsi14 ? `RSI:${c.rsi14.toFixed(0)}` : "";
      const vol = c.volumeAlert ? "⚡量能放大" : "";
      const range52 = [c.weekLow52 && `52W低:${c.weekLow52}`, c.weekHigh52 && `52W高:${c.weekHigh52}`].filter(Boolean).join(" ");
      return `${c.symbol} ${c.name} | 現價:${c.price} ${chg} | ${sma} ${rsi} ${range52} ${vol}`.trim();
    }).join("\n");
  }

  return `你是專業選股分析師，分析${market === "TW" ? "台灣" : "美國"}股市今日機會。

大盤環境：
指數 ${marketSnapshot.indexPrice}（今日${marketSnapshot.indexChangePct >= 0 ? "+" : ""}${marketSnapshot.indexChangePct.toFixed(2)}%）
VIX ${marketSnapshot.vix}

## 候選標的（按價格區間）

### ${currency}50 以下
${formatTier(tiers.tier50)}

### ${currency}100 以下 (${currency}50–100)
${formatTier(tiers.tier100)}

### ${currency}200 以下 (${currency}100–200)
${formatTier(tiers.tier200)}

### ETF
${formatTier(tiers.etfs)}

## 輸出格式（JSON）

輸出一個 JSON 物件，必須包含以下欄位：

\`\`\`
{
  "sentiment": "bull" | "bear" | "neutral",
  "sentimentReason": "大盤今日...，VIX=XX，偏...",
  "picksUnder50": [ <3個推薦> ],
  "picksUnder100": [ <3個推薦> ],
  "picksUnder200": [ <3個推薦> ],
  "etfPicks": [ <3個推薦> ]
}
\`\`\`

每個推薦的格式：
\`\`\`
{
  "symbol": "2886",
  "name": "兆豐金",
  "market": "${market}",
  "signal": "bull",
  "currentPrice": 41.5,
  "entryPoint": 40.0,
  "targetPrice": 47.0,
  "stopLoss": 38.5,
  "upsidePct": 13.3,
  "confidence": 68,
  "reason": "站穩SMA20(40.2)，RSI=52，配息穩定，目標47（+13%），停損38.5（-5%）",
  "volumeAlert": false
}
\`\`\`

## 規則
- 每個價格區間必須選恰好 3 個標的（不可多不可少）
- ETF 選 3 個
- **currentPrice** 必須與上方資料一致，不可捏造
- **entryPoint** = 建議進場價（略低於現價的理想買點，或現價本身）
- **targetPrice** 和 **stopLoss** 必須是具體數字
- **upsidePct** = (targetPrice - currentPrice) / currentPrice × 100
- **reason** 必須包含 SMA/RSI 實際數字，≤80字
- **confidence** 介於 50–85，不可給超過 85
- **volumeAlert** = true 只在資料顯示「⚡量能放大」時
- 若某價格區間候選不足 3 個，從相鄰區間挑選最接近邊界的標的補足
- 只輸出 JSON，不加任何說明`;
}
```

---

## Step 4: Save market analysis to DB

### New migration: `supabase/migrations/202606300008_market_analysis.sql`

```sql
create table if not exists public.market_analysis_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  daily_run_id  uuid references public.daily_runs(id) on delete set null,
  market        text not null,   -- 'TW' | 'US'
  sentiment     text,
  sentiment_reason text,
  picks_under_50   jsonb,
  picks_under_100  jsonb,
  picks_under_200  jsonb,
  etf_picks        jsonb,
  created_at    timestamptz not null default now()
);

alter table public.market_analysis_runs enable row level security;

create policy "Users see own market analysis"
  on public.market_analysis_runs for all
  using (auth.uid() = user_id);

create index on public.market_analysis_runs (user_id, market, created_at desc);
```

Save both TW and US results after `runMarketAnalysis()` completes in the daily route:

```typescript
await supabase.from("market_analysis_runs").insert([
  {
    user_id: userId,
    daily_run_id: dailyRunId,
    market: "TW",
    sentiment: twResult.sentiment,
    sentiment_reason: twResult.sentimentReason,
    picks_under_50: twResult.picksUnder50,
    picks_under_100: twResult.picksUnder100,
    picks_under_200: twResult.picksUnder200,
    etf_picks: twResult.etfPicks,
  },
  {
    user_id: userId,
    daily_run_id: dailyRunId,
    market: "US",
    sentiment: usResult.sentiment,
    sentiment_reason: usResult.sentimentReason,
    picks_under_50: usResult.picksUnder50,
    picks_under_100: usResult.picksUnder100,
    picks_under_200: usResult.picksUnder200,
    etf_picks: usResult.etfPicks,
  }
]);
```

---

## Step 5: Rewrite the daily analysis page

### File: `src/app/analysis/daily/page.tsx`

Full rewrite. Key imports:

```typescript
import Link from "next/link";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addMarketPickToWatchlist } from "@/app/actions";
```

#### Page header

```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 className="text-2xl font-semibold text-slate-950">市場分析</h1>
    <p className="mt-1 text-sm text-slate-600">台灣與美國市場今日回顧與精選推薦。</p>
  </div>
  <RunAnalysisButton />
</div>
```

#### Tab switcher (use URL searchParam `?market=TW` / `?market=US`)

```tsx
// Page receives searchParams: { market?: string }
const activeMarket = searchParams.market === "US" ? "US" : "TW";
```

```tsx
<div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
  <Link
    href="?market=TW"
    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
      activeMarket === "TW"
        ? "bg-white text-slate-950 shadow-sm"
        : "text-slate-600 hover:text-slate-950"
    }`}
  >
    🇹🇼 台灣市場
  </Link>
  <Link
    href="?market=US"
    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
      activeMarket === "US"
        ? "bg-white text-slate-950 shadow-sm"
        : "text-slate-600 hover:text-slate-950"
    }`}
  >
    🇺🇸 美國市場
  </Link>
</div>
```

#### Fetch market analysis data

```typescript
// Get the latest run for today
const today = todayIsoDate();
const { data: run } = await supabase
  .from("daily_runs")
  .select("id, status, run_date")
  .eq("user_id", user.id)
  .eq("run_date", today)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

// Get market analysis for active market tab
const { data: analysisRow } = run
  ? await supabase
      .from("market_analysis_runs")
      .select("*")
      .eq("daily_run_id", run.id)
      .eq("market", activeMarket)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  : { data: null };

// Get market snapshot for the index card
const { data: marketSnapshotData } = run
  ? await supabase
      .from("daily_runs")
      .select("market_snapshot")
      .eq("id", run.id)
      .maybeSingle()
  : { data: null };

// Get upcoming earnings
const { data: earningsData } = await supabase
  .from("earnings_events")  // or wherever earnings are stored
  .select("symbol, company_name, report_date, estimate_eps")
  .gte("report_date", today)
  .order("report_date", { ascending: true })
  .limit(5);
```

#### 大盤回顧 section

```tsx
{/* Market Overview */}
<section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-semibold text-slate-950">
      {activeMarket === "TW" ? "🇹🇼 台灣大盤" : "🇺🇸 美國大盤"}
    </h2>
    <SentimentBadge sentiment={analysisRow?.sentiment ?? null} />
  </div>
  {analysisRow?.sentiment_reason && (
    <p className="mt-2 text-sm text-slate-600">{analysisRow.sentiment_reason}</p>
  )}
  {/* Index numbers from market snapshot if available */}
  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
    <IndexMiniCard title={activeMarket === "TW" ? "加權指數" : "S&P 500"} snapshot={indexSnapshot} />
    <IndexMiniCard title={activeMarket === "TW" ? "成交量" : "NASDAQ"} snapshot={index2Snapshot} />
    <IndexMiniCard title={activeMarket === "TW" ? "美元/台幣" : "VIX"} snapshot={index3Snapshot} />
  </div>
</section>
```

#### 近期重要事項 section

```tsx
{/* What's Coming */}
<section className="space-y-3">
  <h2 className="text-lg font-semibold text-slate-950">近期重要事項</h2>
  {upcomingEvents.length === 0 ? (
    <p className="text-sm text-slate-400">暫無已知重要事項。</p>
  ) : (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
      {upcomingEvents.map((event, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3">
          <div>
            <span className="text-sm font-medium text-slate-950">{event.title}</span>
            {event.detail && (
              <span className="ml-2 text-xs text-slate-500">{event.detail}</span>
            )}
          </div>
          <span className="text-xs font-medium text-slate-400">{event.date}</span>
        </div>
      ))}
    </div>
  )}
</section>
```

For `upcomingEvents`, build a static list per market + merge with earnings from DB:
```typescript
// Hard-coded recurring events to show when no dynamic data available
const twRecurringEvents = [
  { title: "台灣出口數據", detail: "每月7日前後公布", date: "每月" },
  { title: "央行理監事會議", detail: "季度一次", date: "季度" },
];
const usRecurringEvents = [
  { title: "FOMC 會議", detail: "利率決策", date: "每6週" },
  { title: "CPI 通膨數據", detail: "月度公布", date: "每月" },
  { title: "非農就業報告", detail: "每月第一個週五", date: "每月" },
];
```

#### 選股推薦 sections (3 per price tier)

```tsx
{/* Stock Picks by Price Tier */}
{[
  { label: `${currency}50 以下`, picks: asPickArray(analysisRow?.picks_under_50) },
  { label: `${currency}100 以下`, picks: asPickArray(analysisRow?.picks_under_100) },
  { label: `${currency}200 以下`, picks: asPickArray(analysisRow?.picks_under_200) },
].map(({ label, picks }) => (
  <section key={label} className="space-y-3">
    <h2 className="text-lg font-semibold text-slate-950">💡 選股推薦 — {label}</h2>
    {picks.length === 0 ? (
      <EmptyAnalysis />
    ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {picks.map((pick: ScanPick) => (
          <PickCard key={pick.symbol} pick={pick} />
        ))}
      </div>
    )}
  </section>
))}

{/* ETF Picks */}
<section className="space-y-3">
  <h2 className="text-lg font-semibold text-slate-950">📦 ETF 推薦</h2>
  {asPickArray(analysisRow?.etf_picks).length === 0 ? (
    <EmptyAnalysis />
  ) : (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {asPickArray(analysisRow?.etf_picks).map((pick: ScanPick) => (
        <PickCard key={pick.symbol} pick={pick} />
      ))}
    </div>
  )}
</section>
```

#### `PickCard` component

```tsx
function PickCard({ pick }: { pick: ScanPick }) {
  const isBull = pick.signal === "bull";
  const isBear = pick.signal === "bear";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-bold text-slate-950">{pick.symbol}</div>
          <div className="text-xs text-slate-500">{pick.name}</div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
          isBull ? "bg-green-100 text-green-800" :
          isBear ? "bg-red-100 text-red-800" :
          "bg-slate-100 text-slate-600"
        }`}>
          {isBull ? "🐂 做多" : isBear ? "🐻 做空" : "👀 觀察"}
        </span>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
        <div className="rounded bg-slate-50 p-2">
          <div className="text-slate-400">現價</div>
          <div className="font-semibold text-slate-950">{formatNumber(pick.currentPrice, 2)}</div>
        </div>
        <div className="rounded bg-blue-50 p-2">
          <div className="text-slate-400">進場點</div>
          <div className="font-semibold text-blue-800">{formatNumber(pick.entryPoint, 2)}</div>
        </div>
        <div className="rounded bg-green-50 p-2">
          <div className="text-slate-400">目標價</div>
          <div className="font-semibold text-green-800">{formatNumber(pick.targetPrice, 2)}</div>
        </div>
      </div>

      {/* Stop loss + upside row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-red-600">停損 {formatNumber(pick.stopLoss, 2)}</span>
        <span className={`font-semibold ${pick.upsidePct >= 0 ? "text-green-700" : "text-red-700"}`}>
          {pick.upsidePct >= 0 ? "+" : ""}{formatNumber(pick.upsidePct, 1)}% 空間
        </span>
        <span className="text-slate-400">信心 {pick.confidence}%</span>
      </div>

      {/* Volume alert */}
      {pick.volumeAlert && (
        <div className="rounded bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800">
          ⚡ 今日量能放大
        </div>
      )}

      {/* Reason */}
      <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-2">
        {pick.reason}
      </p>

      {/* Add to watchlist */}
      <form action={addMarketPickToWatchlist}>
        <input type="hidden" name="symbol" value={pick.symbol} />
        <input type="hidden" name="market" value={pick.market} />
        <input type="hidden" name="name" value={pick.name} />
        <input type="hidden" name="targetPrice" value={String(pick.targetPrice)} />
        <input type="hidden" name="reason" value={pick.reason} />
        <button
          type="submit"
          className="w-full rounded-md border border-slate-200 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + 加入關注清單
        </button>
      </form>
    </div>
  );
}
```

#### Helper components

```tsx
function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const map = {
    bull: { label: "🐂 市場偏多", cls: "bg-green-100 text-green-800" },
    bear: { label: "🐻 市場偏空", cls: "bg-red-100 text-red-800" },
    neutral: { label: "➡️ 市場中性", cls: "bg-slate-100 text-slate-600" },
  } as const;
  const config = map[sentiment as keyof typeof map] ?? map.neutral;
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-medium ${config.cls}`}>
      {config.label}
    </span>
  );
}

function EmptyAnalysis() {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
      尚未執行今日分析。點擊「執行分析」取得推薦。
    </div>
  );
}

function asPickArray(value: unknown): ScanPick[] {
  return Array.isArray(value) ? (value as ScanPick[]) : [];
}
```

---

## Step 6: Server action `addMarketPickToWatchlist`

### File: `src/app/actions.ts`

```typescript
export async function addMarketPickToWatchlist(formData: FormData) {
  "use server";
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const symbol = formData.get("symbol") as string;
  const market = formData.get("market") as string;
  const name = formData.get("name") as string;
  const targetPrice = parseFloat(formData.get("targetPrice") as string) || null;
  const reason = formData.get("reason") as string;

  // Look up or create security
  let securityId: string | null = null;
  const { data: existing } = await supabase
    .from("securities")
    .select("id")
    .eq("symbol", symbol)
    .eq("market", market)
    .maybeSingle();

  if (existing) {
    securityId = existing.id;
  } else {
    const { data: created } = await supabase
      .from("securities")
      .insert({ symbol, market, name, security_type: "stock" })
      .select("id")
      .single();
    securityId = created?.id ?? null;
  }

  if (!securityId) return;

  await supabase.from("watchlist_items").upsert(
    {
      user_id: user.id,
      security_id: securityId,
      reason: `市場分析推薦：${reason}`,
      target_buy_price: targetPrice,
      status: "watching",
      visibility: "private",
    },
    { onConflict: "user_id,security_id", ignoreDuplicates: true }
  );

  revalidatePath("/analysis/daily");
}
```

---

## Notes for Codex

- The `market_snapshot` column on `daily_runs` may not exist — check and use a fallback if not present; alternatively read the index prices from `division_decisions` or skip the mini index cards
- `upcomingEarnings` from `dataPackage` is already structured — pass it through to the page via the DB or a separate query
- The tab switcher uses URL searchParams (`?market=TW`) — the page component needs `searchParams` as a prop: `{ params, searchParams }: { params: {}; searchParams: { market?: string } }`
- Keep `RunAnalysisButton` in the header — it still triggers the full daily pipeline (which now includes `runMarketAnalysis`)
- The old sections (委員會決策, Division比較, Team Reports, 今日建議) are REMOVED from the page but the backend still generates them — they power the individual `/portfolio/[id]` pages
- Run TW and US market analysis in parallel: `await Promise.all([runMarketAnalysis(client, "TW", ...), runMarketAnalysis(client, "US", ...)])`

---

## Expected result

```
市場分析                                              [執行分析]

[ 🇹🇼 台灣市場 ] [ 🇺🇸 美國市場 ]

🇹🇼 台灣大盤                                    🐂 市場偏多
大盤今日收高，VIX=16 低波動，SMA20站穩，整體偏多格局。
加權指數 21,450  +185 (+0.87%)

近期重要事項
• 台積電 法說會                                    2026-07-17
• 台灣出口數據                                     2026-07-07
• 央行理監事會議                                   2026-09-18

💡 選股推薦 — NT$50 以下
┌────────────┐ ┌────────────┐ ┌────────────┐
│2886 兆豐金  │ │2892 第一金  │ │2002 中鋼   │
│🐂 做多      │ │🐂 做多      │ │👀 觀察      │
│現價  進場  目標│ │現價  進場  目標│ │現價  進場  目標│
│41.5  40.0  47  │ │28.3  27.5  33  │ │28.1  27.0  31  │
│停損 38.5   +13%│ │停損 26.5   +16%│ │停損 26.0   +10%│
│⚡ 今日量能放大 │ │              │ │              │
│突破SMA20(40.2)│ │RSI=42低位回升│ │鋼價回升跡象  │
│[+加入關注清單]│ │[+加入關注清單]│ │[+加入關注清單]│
└────────────┘ └────────────┘ └────────────┘

💡 選股推薦 — NT$100 以下
[3 more cards...]

💡 選股推薦 — NT$200 以下
[3 more cards...]

📦 ETF 推薦
[3 ETF cards...]
```
