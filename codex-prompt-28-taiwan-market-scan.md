# Codex Prompt 28 — Taiwan Daily Market Scan: Concrete Bull/Bear Picks with Numbers

**Goal**: Every daily run should scan a predefined universe of ~25 major Taiwan stocks (excluding what the user already holds or watches) and output 3–5 concrete picks with: bull/bear signal, current price, target price, stop loss, upside %, and a short reason with real numbers. Display them as a dedicated card section on the daily analysis page with a one-click "加入關注清單" button.

**Apply after**: Prompts 01–27 applied.

---

## Overview of changes

| File | Change |
|------|--------|
| `src/lib/analysis/data-package.ts` | Add `twScanUniverse` field — quotes + technicals for universe stocks not already held/watched |
| `src/lib/analysis/schemas.ts` | Add `signal` field to `MarketScanRecommendationSchema`; tighten targetPrice/stopLoss to numeric strings |
| `src/lib/analysis/prompts/tw-scan.ts` | **NEW** — Taiwan-specific scan prompt |
| `src/lib/analysis/pipeline/tw-scan.ts` | **NEW** — runs the TW scan AI call, parses output |
| `src/app/api/analysis/daily/route.ts` | Call `runTaiwanScan()` and save results |
| `supabase/migrations/202606300007_scan_picks.sql` | **NEW** — `daily_scan_picks` table |
| `src/app/analysis/daily/page.tsx` | New "今日台股機會" section with card UI and 加入關注清單 button |
| `src/app/actions.ts` | New server action `addScanPickToWatchlist` |

---

## Step 1: TW stock universe constant

Create file `src/lib/analysis/tw-universe.ts`:

```typescript
// Major Taiwan stocks across sectors — used for daily market scan
// Excludes anything user already holds or watches (filtered at runtime)
export const TW_SCAN_UNIVERSE: Array<{ symbol: string; name: string }> = [
  // Semiconductors
  { symbol: "2330", name: "台積電" },
  { symbol: "2303", name: "聯電" },
  { symbol: "2454", name: "聯發科" },
  { symbol: "3711", name: "日月光投控" },
  // Electronics / EMS
  { symbol: "2317", name: "鴻海" },
  { symbol: "2382", name: "廣達" },
  { symbol: "2357", name: "華碩" },
  { symbol: "2353", name: "宏碁" },
  // Components / Optics
  { symbol: "2308", name: "台達電" },
  { symbol: "3008", name: "大立光" },
  { symbol: "2379", name: "瑞昱" },
  { symbol: "2409", name: "友達" },
  // Financials
  { symbol: "2881", name: "富邦金" },
  { symbol: "2882", name: "國泰金" },
  { symbol: "2891", name: "中信金" },
  { symbol: "2886", name: "兆豐金" },
  { symbol: "2884", name: "玉山金" },
  { symbol: "5880", name: "合庫金" },
  // Petrochemical / Steel
  { symbol: "1301", name: "台塑" },
  { symbol: "1303", name: "南亞" },
  { symbol: "6505", name: "台塑化" },
  { symbol: "2002", name: "中鋼" },
  // Consumer / Retail
  { symbol: "2912", name: "統一超" },
  { symbol: "2207", name: "和泰車" },
  // ETFs
  { symbol: "0050", name: "元大台灣50" },
  { symbol: "0056", name: "元大高股息" },
];
```

---

## Step 2: Add `twScanUniverse` to `DailyDataPackage`

### File: `src/lib/analysis/data-package.ts`

#### Add type

```typescript
export type TwScanItem = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
  sma20: number | null;
  sma60: number | null;
  rsi14: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
};
```

#### Add to `DailyDataPackage` type

```typescript
export type DailyDataPackage = {
  // ... existing fields ...
  twScanUniverse: TwScanItem[];  // ← ADD THIS
};
```

#### Populate in `buildDailyDataPackage`

After building `holdingRows` and `watchlistRows`, compute the list of symbols to exclude:

```typescript
import { TW_SCAN_UNIVERSE } from "@/lib/analysis/tw-universe";
import { computeTechnicals } from "@/lib/analysis/indicators";

// Symbols already in portfolio or watchlist — exclude from scan
const excludedSymbols = new Set([
  ...holdingRows.map((r) => r.securities?.symbol).filter(Boolean),
  ...watchlistRows.map((r) => r.securities?.symbol).filter(Boolean),
]);

const scanCandidates = TW_SCAN_UNIVERSE.filter(
  (item) => !excludedSymbols.has(item.symbol)
);

// Fetch quotes and histories in parallel
const [scanQuotes, scanHistories] = await Promise.all([
  Promise.all(scanCandidates.map((c) => provider.getQuote(c.symbol, "TW").catch(() => null))),
  Promise.all(scanCandidates.map((c) => provider.getHistory(c.symbol, "TW", 90).catch(() => []))),
]);

const twScanUniverse: TwScanItem[] = scanCandidates.flatMap((candidate, i) => {
  const quote = scanQuotes[i];
  if (!quote || quote.qualityState === "missing" || quote.price === 0) return [];
  const history = scanHistories[i] ?? [];
  const technicals = computeTechnicals(history);
  return [{
    symbol: candidate.symbol,
    name: candidate.name,
    price: quote.price,
    change: quote.change,
    changePct: quote.changePct,
    volume: quote.volume ?? null,
    sma20: technicals.sma20 ?? null,
    sma60: technicals.sma60 ?? null,
    rsi14: technicals.rsi14 ?? null,
    weekHigh52: quote.weekHigh52 ?? null,
    weekLow52: quote.weekLow52 ?? null,
  }];
});
```

Add `twScanUniverse` to the return object of `buildDailyDataPackage`.

---

## Step 3: Update `MarketScanRecommendationSchema`

### File: `src/lib/analysis/schemas.ts`

Add `signal` field and make target/stop numeric:

```typescript
export const MarketScanRecommendationSchema = z.object({
  symbol: z.string(),
  market: z.enum(["US", "TW"]),
  name: z.string(),
  signal: z.enum(["bull", "bear", "neutral"]),   // ← ADD
  currentPrice: z.number(),                        // ← ADD (AI echoes the price for verification)
  targetPrice: z.string(),   // keep as string e.g. "950" or "900-960"
  stopLoss: z.string(),      // keep as string e.g. "860"
  upsidePct: z.number(),     // ← ADD: (target - current) / current * 100, calculated by AI
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  reason: z.string(),        // 1-2 sentences, must include actual price numbers
  keyRisks: z.array(z.string()),
});

export type TwScanPick = z.infer<typeof MarketScanRecommendationSchema>;
```

Also update `AGENT_OUTPUT_JSON_SCHEMA` example to include the new fields in `marketScanRecommendations`:

```typescript
"marketScanRecommendations": [
  {
    "symbol": "2330",
    "market": "TW",
    "name": "台積電",
    "signal": "bull",
    "currentPrice": 920.0,
    "targetPrice": "1050",
    "stopLoss": "870",
    "upsidePct": 14.1,
    "timeHorizon": "swing",
    "confidence": 72,
    "reason": "突破季線(SMA60=905)，AI伺服器需求強勁，目標價1050（+14%），停損設870（-5.4%）",
    "keyRisks": ["地緣政治風險", "美中貿易限制"]
  }
]
```

---

## Step 4: New TW scan prompt

Create `src/lib/analysis/prompts/tw-scan.ts`:

```typescript
import type { TwScanItem } from "@/lib/analysis/data-package";

export function buildTwScanPrompt(
  scanUniverse: TwScanItem[],
  marketContext: { taiexPrice: number; taiexChangePct: number; vix: number }
): string {
  const universeText = scanUniverse
    .map((s) => {
      const vs52h = s.weekHigh52 ? `52W高點:${s.weekHigh52}` : "";
      const vs52l = s.weekLow52 ? `52W低點:${s.weekLow52}` : "";
      const sma = [
        s.sma20 ? `SMA20:${s.sma20.toFixed(1)}` : "",
        s.sma60 ? `SMA60:${s.sma60.toFixed(1)}` : "",
      ].filter(Boolean).join(" ");
      const rsi = s.rsi14 ? `RSI:${s.rsi14.toFixed(0)}` : "";
      const chg = `今日${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%`;
      return `${s.symbol} ${s.name} | 現價:${s.price} ${chg} | ${sma} | ${rsi} | ${vs52h} ${vs52l}`.trim();
    })
    .join("\n");

  return `你是一位專注台灣股市的資深選股分析師。

今日大盤環境：
加權指數 ${marketContext.taiexPrice}（今日${marketContext.taiexChangePct >= 0 ? "+" : ""}${marketContext.taiexChangePct.toFixed(2)}%）
VIX ${marketContext.vix}

以下是今日台股掃描標的（已排除用戶現有持股與關注清單）：

${universeText}

## 你的任務

從上述標的中，選出 3–5 個最值得關注的機會，給出明確的多空方向和具體數字。

### 選股標準（按優先順序）

1. **技術面突破/跌破**：現價突破 SMA60（做多信號）或跌破 SMA20（做空/觀察信號）
2. **RSI 位置**：RSI < 35（超賣反彈機會）或 RSI > 70（過熱警示）
3. **52週位置**：接近52週低點但開始反彈（潛在底部），或突破52週高點（強勢突破）
4. **今日量價**：大漲大跌且有技術意義的標的

### 輸出格式（JSON）

回傳一個 JSON 物件，格式如下：

\`\`\`json
{
  "scanSummary": "今日掃描 N 檔，選出 N 個機會。大盤[多/空/震盪]環境，偏[進攻/防守]。",
  "picks": [
    {
      "symbol": "2330",
      "market": "TW",
      "name": "台積電",
      "signal": "bull",
      "currentPrice": 920.0,
      "targetPrice": "1050",
      "stopLoss": "870",
      "upsidePct": 14.1,
      "timeHorizon": "swing",
      "confidence": 72,
      "reason": "突破季線(SMA60=905)，RSI=58尚未過熱，目標前高1050（+14%），停損設季線下方870（-5.4%）",
      "keyRisks": ["地緣政治", "輝達訂單能見度"]
    }
  ]
}
\`\`\`

### 規則

- **signal**: "bull"（做多/買進）, "bear"（做空/減碼警示）, "neutral"（觀察）
- **currentPrice**: 必須與上方資料中的現價一致，不可捏造
- **targetPrice**: 單一數字（如 "1050"），不可寫「視情況」
- **stopLoss**: 單一數字（如 "870"），不可寫「依個人評估」
- **upsidePct**: (targetPrice - currentPrice) / currentPrice × 100，bull 為正，bear 為負
- **reason**: 必須包含 SMA/RSI 實際數字，1-2 句話，不超過 80 字
- **confidence**: 50–85 之間，不可給 90+ 除非訊號極為明確
- 若今日大盤環境極差（VIX > 30 或加權指數跌 > 2%），可只選 1–2 個防守型標的
- 只輸出 JSON，不要任何說明文字`;
}
```

---

## Step 5: New TW scan pipeline

Create `src/lib/analysis/pipeline/tw-scan.ts`:

```typescript
import { buildTwScanPrompt } from "@/lib/analysis/prompts/tw-scan";
import type { DailyDataPackage, TwScanItem } from "@/lib/analysis/data-package";
import type { TwScanPick } from "@/lib/analysis/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type TwScanResult = {
  scanSummary: string;
  picks: TwScanPick[];
};

export async function runTaiwanScan(
  client: { chat: (params: unknown) => Promise<{ content: string }> }, // OpenAI/Anthropic client
  dataPackage: DailyDataPackage,
  userId: string,
  dailyRunId: string
): Promise<TwScanResult> {
  if (dataPackage.twScanUniverse.length === 0) {
    return { scanSummary: "所有台股標的已在持股或關注清單中。", picks: [] };
  }

  const prompt = buildTwScanPrompt(dataPackage.twScanUniverse, {
    taiexPrice: dataPackage.marketSnapshot.taiex.price,
    taiexChangePct: dataPackage.marketSnapshot.taiex.changePct,
    vix: dataPackage.marketSnapshot.vix.price,
  });

  // Use whichever AI client is available — GPT-4o preferred for this structured task
  let raw = "";
  try {
    const response = await client.chat({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    raw = response.content;
  } catch {
    return { scanSummary: "台股掃描 AI 呼叫失敗。", picks: [] };
  }

  let parsed: TwScanResult;
  try {
    const json = JSON.parse(raw);
    parsed = {
      scanSummary: String(json.scanSummary ?? ""),
      picks: (json.picks ?? []).map((p: unknown) => p as TwScanPick).slice(0, 5),
    };
  } catch {
    return { scanSummary: "台股掃描結果解析失敗。", picks: [] };
  }

  // Save picks to daily_scan_picks table
  if (parsed.picks.length > 0) {
    const supabase = createSupabaseServiceClient();
    await supabase.from("daily_scan_picks").insert(
      parsed.picks.map((pick) => ({
        user_id: userId,
        daily_run_id: dailyRunId,
        symbol: pick.symbol,
        market: pick.market,
        name: pick.name,
        signal: pick.signal,
        current_price: pick.currentPrice,
        target_price: parseFloat(pick.targetPrice) || null,
        stop_loss: parseFloat(pick.stopLoss) || null,
        upside_pct: pick.upsidePct,
        time_horizon: pick.timeHorizon,
        confidence: pick.confidence,
        reason: pick.reason,
        key_risks: pick.keyRisks,
        scan_summary: parsed.scanSummary,
      }))
    );
  }

  return parsed;
}
```

---

## Step 6: DB migration

Create `supabase/migrations/202606300007_scan_picks.sql`:

```sql
create table if not exists public.daily_scan_picks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  daily_run_id    uuid references public.daily_runs(id) on delete set null,
  symbol          text not null,
  market          text not null default 'TW',
  name            text not null,
  signal          text not null,          -- 'bull' | 'bear' | 'neutral'
  current_price   numeric,
  target_price    numeric,
  stop_loss       numeric,
  upside_pct      numeric,
  time_horizon    text,
  confidence      integer,
  reason          text,
  key_risks       jsonb,
  scan_summary    text,
  added_to_watchlist boolean default false,
  created_at      timestamptz not null default now()
);

alter table public.daily_scan_picks enable row level security;

create policy "Users see own scan picks"
  on public.daily_scan_picks for all
  using (auth.uid() = user_id);

create index on public.daily_scan_picks (user_id, created_at desc);
```

---

## Step 7: Call `runTaiwanScan` from the daily route

### File: `src/app/api/analysis/daily/route.ts`

After the existing team/committee pipeline completes, add:

```typescript
import { runTaiwanScan } from "@/lib/analysis/pipeline/tw-scan";

// After committee decision is saved:
const twScanResult = await runTaiwanScan(
  openaiClient,   // use the existing OpenAI client in scope
  dataPackage,
  userId,
  dailyRunId
);
// twScanResult is available but doesn't need to be returned in the API response
// (page fetches directly from daily_scan_picks table)
```

---

## Step 8: Display on daily analysis page

### File: `src/app/analysis/daily/page.tsx`

#### Fetch today's scan picks

Add to the existing `Promise.all` data fetch:

```typescript
supabase
  .from("daily_scan_picks")
  .select("*")
  .eq("daily_run_id", runId)
  .order("confidence", { ascending: false })
```

Store result as `scanPicks`.

#### Add "今日台股機會" section

Add this section **before** the "今日建議" section:

```tsx
{/* 今日台股機會 */}
<section className="space-y-4">
  <div>
    <h2 className="text-xl font-semibold text-slate-950">今日台股機會</h2>
    <p className="text-sm text-slate-500 mt-0.5">{scanSummary}</p>
  </div>

  {scanPicks.length === 0 ? (
    <p className="text-sm text-slate-400">今日無符合條件的台股機會。</p>
  ) : (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {scanPicks.map((pick) => (
        <ScanPickCard key={pick.id} pick={pick} />
      ))}
    </div>
  )}
</section>
```

#### `ScanPickCard` component

Add above the page function:

```tsx
type ScanPick = {
  id: string;
  symbol: string;
  name: string;
  signal: string;
  current_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  upside_pct: number | null;
  confidence: number | null;
  time_horizon: string | null;
  reason: string | null;
  key_risks: string[] | null;
  added_to_watchlist: boolean;
};

function SignalBadge({ signal }: { signal: string }) {
  if (signal === "bull") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
      🐂 做多
    </span>
  );
  if (signal === "bear") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
      🐻 做空
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      👀 觀察
    </span>
  );
}

function ScanPickCard({ pick }: { pick: ScanPick }) {
  const upside = pick.upside_pct;
  const upsideColor = upside !== null && upside >= 0 ? "text-green-700" : "text-red-700";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-lg font-bold text-slate-950">{pick.symbol}</span>
          <span className="ml-2 text-sm text-slate-500">{pick.name}</span>
        </div>
        <SignalBadge signal={pick.signal} />
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-slate-50 p-2">
          <div className="text-xs text-slate-500">現價</div>
          <div className="text-sm font-semibold text-slate-950">
            {pick.current_price !== null ? formatNumber(pick.current_price, 2) : "—"}
          </div>
        </div>
        <div className="rounded bg-green-50 p-2">
          <div className="text-xs text-slate-500">目標價</div>
          <div className="text-sm font-semibold text-green-800">
            {pick.target_price !== null ? formatNumber(pick.target_price, 2) : "—"}
          </div>
        </div>
        <div className="rounded bg-red-50 p-2">
          <div className="text-xs text-slate-500">停損</div>
          <div className="text-sm font-semibold text-red-800">
            {pick.stop_loss !== null ? formatNumber(pick.stop_loss, 2) : "—"}
          </div>
        </div>
      </div>

      {/* Upside + confidence */}
      <div className="flex items-center gap-3 text-sm">
        {upside !== null && (
          <span className={`font-semibold ${upsideColor}`}>
            {upside >= 0 ? "+" : ""}{formatNumber(upside, 1)}% 空間
          </span>
        )}
        <span className="text-slate-400">·</span>
        <span className="text-slate-600">信心 {pick.confidence ?? "—"}%</span>
        {pick.time_horizon && (
          <>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">
              {pick.time_horizon === "short" ? "短線" : pick.time_horizon === "swing" ? "波段" : "長線"}
            </span>
          </>
        )}
      </div>

      {/* Reason */}
      {pick.reason && (
        <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          {pick.reason}
        </p>
      )}

      {/* Add to watchlist button */}
      <form action={addScanPickToWatchlist}>
        <input type="hidden" name="pickId" value={pick.id} />
        <input type="hidden" name="symbol" value={pick.symbol} />
        <button
          type="submit"
          disabled={pick.added_to_watchlist}
          className="w-full rounded-md border border-slate-200 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {pick.added_to_watchlist ? "✓ 已加入關注清單" : "+ 加入關注清單"}
        </button>
      </form>
    </div>
  );
}
```

---

## Step 9: Server action `addScanPickToWatchlist`

### File: `src/app/actions.ts`

Add a new server action:

```typescript
export async function addScanPickToWatchlist(formData: FormData) {
  "use server";
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const pickId = formData.get("pickId") as string;
  const symbol = formData.get("symbol") as string;

  // Look up security_id for this symbol in TW market
  const { data: security } = await supabase
    .from("securities")
    .select("id")
    .eq("symbol", symbol)
    .eq("market", "TW")
    .maybeSingle();

  if (security) {
    // Insert into watchlist_items if not already there
    await supabase.from("watchlist_items").upsert(
      {
        user_id: user.id,
        security_id: security.id,
        reason: "每日台股掃描推薦",
        status: "watching",
        visibility: "private",
      },
      { onConflict: "user_id,security_id", ignoreDuplicates: true }
    );
  }

  // Mark pick as added
  await supabase
    .from("daily_scan_picks")
    .update({ added_to_watchlist: true })
    .eq("id", pickId)
    .eq("user_id", user.id);

  revalidatePath("/analysis/daily");
}
```

---

## Expected result on daily analysis page

```
今日台股機會
今日掃描 24 檔，選出 4 個機會。大盤震盪環境，偏波段操作。

┌─────────────────────────────┐ ┌─────────────────────────────┐
│ 2454 聯發科          🐂 做多 │ │ 2308 台達電          🐂 做多 │
│ 現價    目標價   停損        │ │ 現價    目標價   停損        │
│ 920     1050     860        │ │ 345     410      315        │
│                             │ │                             │
│ +14.1% 空間 · 信心72% · 波段│ │ +18.8% 空間 · 信心68% · 波段│
│                             │ │                             │
│ 突破季線(SMA60=905)，AI晶   │ │ 伺服器電源需求強，RSI=52   │
│ 片訂單能見度佳，目標1050    │ │ 中性，目標410為前高         │
│                             │ │                             │
│ [+ 加入關注清單]            │ │ [+ 加入關注清單]            │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## Notes for Codex

- The AI client passed to `runTaiwanScan` should be the same OpenAI client already in scope in the daily route — do not create a new one
- `parseFloat(pick.targetPrice)` handles strings like "1050" or "900-960" (takes the first number for the latter case — acceptable)
- The `securities` table lookup in `addScanPickToWatchlist` may return null if the symbol isn't yet in the DB — handle gracefully (upsert to securities first if needed, or just skip watchlist insert and only mark as added)
- Run `runTaiwanScan` after the main pipeline (committee decision) is done — it should NOT block the main pipeline response
- `twScanUniverse` fetch adds ~25 Yahoo Finance calls — these run in parallel so latency impact is minimal (~1-2 sec extra)
