# Codex Prompt 31 — Simulation: Division Dashboard Tabs + Scoring System

**Goal**: (1) Redesign the simulation page into two division tabs — each with a full dashboard. (2) Build a 5-dimension scoring system (Alpha, Win Rate, Risk Control, Conviction Calibration, Prediction Accuracy) evaluated weekly, with cumulative scores, badge awards, and head-to-head comparison.

**Apply after**: Prompt 30 applied (simulation tables + trade pipeline exist).

---

## Part A: Division Dashboard Tabs

### File: `src/app/performance/simulation/page.tsx`

Replace the current side-by-side layout with a two-tab structure:

```
模擬交易競賽
[執行今日交易] [產生日報] [每週評估]

[ GPT Division ] [ Anthropic Division ]      ← tab switcher (?division=gpt / ?division=anthropic)

─── GPT Division Dashboard ───────────────────────────────────────────
```

Use URL searchParam `?division=gpt` (default) / `?division=anthropic` for the active tab.

---

### Division Dashboard layout (each tab identical structure, different data)

```
┌─────────────────────────────────────────────────────────────────┐
│ SUMMARY CARDS (4 cards)                                         │
│ 總資產         美股 P&L      台股 P&L      本週積分             │
│ $11,842        +$1,842       +NT$18,500   78 / 100             │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌──────────────────────────────────┐
│ 績效評分                  │  │ 累積報酬 vs 大盤                  │
│ Alpha          28/30     │  │ [line chart: division vs index]  │
│ 勝率           16/20     │  │                                  │
│ 風險控制       18/20     │  │                                  │
│ 信心校準       11/15     │  │                                  │
│ 預測準確       10/15     │  │                                  │
│ ─────────────────────── │  │                                  │
│ 總分           83/100    │  │                                  │
│ 🏆 本週冠軍               │  │                                  │
└──────────────────────────┘  └──────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 當前持倉                                                         │
│ 美股                              台股                           │
│ NVDA 2股 $875→$912 +4.2% ▸       2330 1股 920→947 +2.9% ▸     │
│ AAPL 5股 $182→$184 +1.1% ▸       (空倉)                        │
│ 現金: $7,342                      現金: NT$210,500              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 最新日報 (2026-07-01)                                            │
│ 今日操作：買入 NVDA 2股 @ $875（突破SMA60=855，RSI=58...）        │
│ 明日展望：若AAPL跌破183考慮減碼...                               │
│ [查看完整日報 →]                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 交易記錄                                  [全部] [買入] [賣出]   │
│ 日期   動作  代號  股數  價格   金額    損益     信心  [詳情]     │
│ 07-01  買    NVDA  2    $875  $1,750   —       78    [→]       │
│ 06-28  賣    TSLA  3    $240  $720    +$62 +9%  71    [→]      │
└─────────────────────────────────────────────────────────────────┘
```

Each position row and trade row links to the detail page `/performance/simulation/trade/[id]`.

---

### Data fetch for each division tab

```typescript
const division = (searchParams.division === "anthropic" ? "anthropic" : "gpt") as "gpt" | "anthropic";

const [
  portfoliosResult,
  positionsResult,
  tradesResult,
  latestReportResult,
  latestScoreResult,
  weeklyEvalsResult,
] = await Promise.all([
  supabase.from("sim_portfolios").select("*").eq("user_id", user.id).eq("division", division),
  supabase.from("sim_positions")
    .select("*, sim_portfolios!inner(division, market, user_id)")
    .eq("sim_portfolios.user_id", user.id)
    .eq("sim_portfolios.division", division)
    .eq("status", "open"),
  supabase.from("sim_trades")
    .select("*, sim_portfolios!inner(division, market, user_id)")
    .eq("sim_portfolios.user_id", user.id)
    .eq("sim_portfolios.division", division)
    .order("executed_at", { ascending: false })
    .limit(20),
  supabase.from("sim_daily_reports")
    .select("*")
    .eq("user_id", user.id)
    .eq("division", division)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle(),
  supabase.from("sim_scores")
    .select("*")
    .eq("user_id", user.id)
    .eq("division", division)
    .order("score_date", { ascending: false })
    .limit(1)
    .maybeSingle(),
  supabase.from("sim_weekly_evals")
    .select("*")
    .eq("user_id", user.id)
    .eq("division", division)
    .order("week_end", { ascending: false })
    .limit(8),  // 8 weeks of history for chart
]);
```

---

## Part B: Scoring System

### New DB migration: `supabase/migrations/202606300010_sim_scoring.sql`

```sql
-- Weekly scores per division (computed after each weekly eval)
create table if not exists public.sim_scores (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  division                text not null,   -- 'gpt' | 'anthropic'
  score_date              date not null,   -- Friday of evaluation week
  week_start              date not null,
  week_end                date not null,

  -- Dimension scores (raw points)
  alpha_score             numeric not null default 0,   -- 0–30
  win_rate_score          numeric not null default 0,   -- 0–20
  risk_control_score      numeric not null default 0,   -- 0–20
  conviction_score        numeric not null default 0,   -- 0–15
  prediction_score        numeric not null default 0,   -- 0–15
  total_score             numeric not null default 0,   -- 0–100

  -- Supporting data
  us_return_pct           numeric,
  tw_return_pct           numeric,
  us_benchmark_pct        numeric,   -- NASDAQ return same week
  tw_benchmark_pct        numeric,   -- TAIEX return same week
  us_alpha_pct            numeric,   -- us_return - us_benchmark
  tw_alpha_pct            numeric,

  win_rate_pct            numeric,   -- % of closed trades profitable
  trades_evaluated        integer,
  winning_trades          integer,
  losing_trades           integer,

  max_drawdown_pct        numeric,   -- worst peak-to-trough this week
  peak_value              numeric,
  trough_value            numeric,

  avg_conviction_winners  numeric,   -- avg conviction on winning trades
  avg_conviction_losers   numeric,   -- avg conviction on losing trades
  conviction_correlation  numeric,   -- positive = good calibration

  predictions_made        integer,   -- statements in daily reports
  predictions_correct     integer,   -- verified next day
  prediction_accuracy_pct numeric,

  -- Badges earned this week
  badges                  jsonb,     -- array of badge strings

  -- Cumulative (rolling)
  cumulative_total        numeric,   -- avg of all weeks to date
  cumulative_alpha        numeric,
  cumulative_win_rate_pct numeric,

  created_at              timestamptz not null default now(),
  unique (user_id, division, score_date)
);

-- Prediction tracking (extracted from daily reports, verified next day)
create table if not exists public.sim_predictions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  division          text not null,
  report_date       date not null,   -- date of the daily report
  verify_date       date not null,   -- next trading day
  condition_text    text not null,   -- e.g. "若AAPL跌破183考慮減碼"
  condition_type    text,            -- 'price_trigger' | 'action_follow_through' | 'market_direction'
  symbol            text,
  trigger_price     numeric,
  trigger_direction text,            -- 'above' | 'below'
  predicted_action  text,            -- 'buy' | 'sell' | 'hold' | 'market_up' | 'market_down'
  -- Verification (filled next day)
  condition_met     boolean,         -- did the trigger condition actually happen?
  action_taken      boolean,         -- did the division actually do what they said?
  score_awarded     boolean,         -- true if condition met AND action followed through
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.sim_scores      enable row level security;
alter table public.sim_predictions enable row level security;

create policy "own sim_scores"      on public.sim_scores      for all using (auth.uid() = user_id);
create policy "own sim_predictions" on public.sim_predictions for all using (auth.uid() = user_id);

create index on public.sim_scores      (user_id, division, score_date desc);
create index on public.sim_predictions (user_id, division, report_date);
```

---

## Part C: Scoring Algorithm

### File: `src/lib/analysis/pipeline/sim-scoring.ts`

```typescript
export type ScoreBreakdown = {
  alpha: { score: number; max: 30; detail: string };
  winRate: { score: number; max: 20; detail: string };
  riskControl: { score: number; max: 20; detail: string };
  convictionCalibration: { score: number; max: 15; detail: string };
  predictionAccuracy: { score: number; max: 15; detail: string };
  total: number;
  badges: string[];
};

export async function computeWeeklyScore(params: {
  userId: string;
  division: "gpt" | "anthropic";
  weekStart: string;
  weekEnd: string;
  usReturnPct: number;
  twReturnPct: number;
  usBenchmarkPct: number;  // NASDAQ
  twBenchmarkPct: number;  // TAIEX
  closedTrades: SimTrade[];
  weeklySnapshots: { date: string; value: number }[];  // daily portfolio values
  predictions: SimPrediction[];
}): Promise<ScoreBreakdown> {

  // ── 1. ALPHA SCORE (0–30) ──────────────────────────────────────
  const usAlpha = params.usReturnPct - params.usBenchmarkPct;
  const twAlpha = params.twReturnPct - params.twBenchmarkPct;
  const avgAlpha = (usAlpha + twAlpha) / 2;

  let alphaScore: number;
  let alphaDetail: string;
  if (avgAlpha > 5) {
    alphaScore = 30;
    alphaDetail = `大幅超越大盤 +${avgAlpha.toFixed(2)}%，滿分`;
  } else if (avgAlpha > 3) {
    alphaScore = 25;
    alphaDetail = `超越大盤 +${avgAlpha.toFixed(2)}%`;
  } else if (avgAlpha > 1) {
    alphaScore = 18;
    alphaDetail = `小幅超越大盤 +${avgAlpha.toFixed(2)}%`;
  } else if (avgAlpha > -1) {
    alphaScore = 10;
    alphaDetail = `與大盤持平 (${avgAlpha.toFixed(2)}%)`;
  } else if (avgAlpha > -3) {
    alphaScore = 5;
    alphaDetail = `小幅落後大盤 ${avgAlpha.toFixed(2)}%`;
  } else {
    alphaScore = 0;
    alphaDetail = `大幅落後大盤 ${avgAlpha.toFixed(2)}%`;
  }

  // ── 2. WIN RATE SCORE (0–20) ───────────────────────────────────
  const closedTrades = params.closedTrades.filter(t => t.action === "sell" && t.outcome_pnl !== null);
  const winningTrades = closedTrades.filter(t => (t.outcome_pnl ?? 0) > 0);
  const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : null;

  let winRateScore: number;
  let winRateDetail: string;
  if (winRate === null) {
    winRateScore = 10;  // no closed trades — neutral
    winRateDetail = "本週無已結算交易";
  } else if (winRate >= 0.70) {
    winRateScore = 20;
    winRateDetail = `勝率 ${(winRate * 100).toFixed(0)}%，優秀`;
  } else if (winRate >= 0.60) {
    winRateScore = 15;
    winRateDetail = `勝率 ${(winRate * 100).toFixed(0)}%，良好`;
  } else if (winRate >= 0.50) {
    winRateScore = 10;
    winRateDetail = `勝率 ${(winRate * 100).toFixed(0)}%，普通`;
  } else {
    winRateScore = 5;
    winRateDetail = `勝率 ${(winRate * 100).toFixed(0)}%，需改進`;
  }

  // ── 3. RISK CONTROL SCORE (0–20) ──────────────────────────────
  // Calculate max drawdown from daily snapshots
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const snap of params.weeklySnapshots) {
    if (snap.value > peak) peak = snap.value;
    const drawdown = (peak - snap.value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  let riskScore: number;
  let riskDetail: string;
  if (maxDrawdown < 0.03) {
    riskScore = 20;
    riskDetail = `最大回撤 ${(maxDrawdown * 100).toFixed(1)}%，風控優秀`;
  } else if (maxDrawdown < 0.05) {
    riskScore = 17;
    riskDetail = `最大回撤 ${(maxDrawdown * 100).toFixed(1)}%，風控良好`;
  } else if (maxDrawdown < 0.10) {
    riskScore = 12;
    riskDetail = `最大回撤 ${(maxDrawdown * 100).toFixed(1)}%，可接受`;
  } else if (maxDrawdown < 0.15) {
    riskScore = 6;
    riskDetail = `最大回撤 ${(maxDrawdown * 100).toFixed(1)}%，波動偏大`;
  } else {
    riskScore = 0;
    riskDetail = `最大回撤 ${(maxDrawdown * 100).toFixed(1)}%，風控不足`;
  }

  // ── 4. CONVICTION CALIBRATION (0–15) ──────────────────────────
  // Do high-conviction trades win more than low-conviction trades?
  const tradesWithConviction = closedTrades.filter(t => t.conviction !== null && t.outcome_pnl !== null);
  let convictionScore: number;
  let convictionDetail: string;

  if (tradesWithConviction.length < 3) {
    convictionScore = 8;  // not enough data — neutral
    convictionDetail = "資料不足，給予中性分數";
  } else {
    const highConv = tradesWithConviction.filter(t => (t.conviction ?? 0) >= 70);
    const lowConv  = tradesWithConviction.filter(t => (t.conviction ?? 0) < 70);
    const highWinRate = highConv.length > 0
      ? highConv.filter(t => (t.outcome_pnl ?? 0) > 0).length / highConv.length
      : null;
    const lowWinRate = lowConv.length > 0
      ? lowConv.filter(t => (t.outcome_pnl ?? 0) > 0).length / lowConv.length
      : null;

    const avgHighConv = highConv.length > 0
      ? highConv.reduce((s, t) => s + (t.outcome_pct ?? 0), 0) / highConv.length
      : null;
    const avgLowConv = lowConv.length > 0
      ? lowConv.reduce((s, t) => s + (t.outcome_pct ?? 0), 0) / lowConv.length
      : null;

    if (avgHighConv !== null && avgLowConv !== null && avgHighConv > avgLowConv + 0.02) {
      convictionScore = 15;
      convictionDetail = `高信心交易平均報酬 ${(avgHighConv*100).toFixed(1)}% > 低信心 ${(avgLowConv*100).toFixed(1)}%，校準優秀`;
    } else if (avgHighConv !== null && avgLowConv !== null && avgHighConv > avgLowConv) {
      convictionScore = 10;
      convictionDetail = `高信心交易略優於低信心，校準良好`;
    } else if (avgHighConv !== null && avgLowConv !== null) {
      convictionScore = 5;
      convictionDetail = `高低信心交易表現相近或逆轉，信心評級需校準`;
    } else {
      convictionScore = 8;
      convictionDetail = "資料不足";
    }
  }

  // ── 5. PREDICTION ACCURACY (0–15) ─────────────────────────────
  // Check sim_predictions for this division this week (verified predictions)
  const verifiedPredictions = params.predictions.filter(
    p => p.verified_at !== null && p.condition_met !== null
  );

  let predictionScore: number;
  let predictionDetail: string;

  if (verifiedPredictions.length === 0) {
    predictionScore = 8;  // neutral
    predictionDetail = "本週無可驗證預測";
  } else {
    const conditionsMet = verifiedPredictions.filter(p => p.condition_met);
    const followedThrough = verifiedPredictions.filter(p => p.condition_met && p.action_taken);
    const accuracy = followedThrough.length / Math.max(conditionsMet.length, 1);

    if (accuracy >= 0.80) {
      predictionScore = 15;
      predictionDetail = `${followedThrough.length}/${conditionsMet.length} 預測條件達成且執行，準確率優秀`;
    } else if (accuracy >= 0.60) {
      predictionScore = 11;
      predictionDetail = `${followedThrough.length}/${conditionsMet.length} 預測執行，準確率良好`;
    } else if (accuracy >= 0.40) {
      predictionScore = 7;
      predictionDetail = `${followedThrough.length}/${conditionsMet.length} 預測執行，執行力需加強`;
    } else {
      predictionScore = 3;
      predictionDetail = `預測後未執行，一致性不足`;
    }
  }

  // ── TOTAL + BADGES ─────────────────────────────────────────────
  const total = alphaScore + winRateScore + riskScore + convictionScore + predictionScore;

  const badges: string[] = [];
  if (avgAlpha > 5)        badges.push("📈 大盤終結者");
  if (winRate && winRate >= 0.70) badges.push("⚡ 高勝率");
  if (maxDrawdown < 0.03)  badges.push("🛡️ 穩健風控");
  if (convictionScore >= 13) badges.push("🎯 信心校準大師");
  if (predictionScore >= 13) badges.push("🔮 精準預測");
  if (total >= 85)          badges.push("🏆 本週冠軍");
  if (total >= 95)          badges.push("💎 完美週");

  return {
    alpha:                { score: alphaScore,    max: 30, detail: alphaDetail },
    winRate:              { score: winRateScore,  max: 20, detail: winRateDetail },
    riskControl:          { score: riskScore,     max: 20, detail: riskDetail },
    convictionCalibration:{ score: convictionScore, max: 15, detail: convictionDetail },
    predictionAccuracy:   { score: predictionScore, max: 15, detail: predictionDetail },
    total,
    badges,
  };
}
```

---

## Part D: Prediction Extraction from Daily Reports

### File: `src/lib/analysis/pipeline/sim-predictions.ts`

After saving each daily report, call an AI to extract verifiable predictions from `tomorrow_outlook` and `planned_actions`:

```typescript
export async function extractPredictions(
  openaiClient: OpenAI,
  division: string,
  reportDate: string,
  tomorrowOutlook: string,
  plannedActions: string | null
): Promise<ExtractedPrediction[]> {

  const prompt = `從以下投資日報的「明日展望」和「明日計劃」中，提取所有可在明日驗證的具體預測或行動計劃。

明日展望：
${tomorrowOutlook}

明日計劃：
${plannedActions ?? "（無）"}

輸出 JSON 陣列，每個元素格式：
{
  "condition_text": "原文描述",
  "condition_type": "price_trigger" | "action_follow_through" | "market_direction",
  "symbol": "代號或null",
  "trigger_price": 數字或null,
  "trigger_direction": "above" | "below" | null,
  "predicted_action": "buy" | "sell" | "hold" | "market_up" | "market_down"
}

只提取有明確條件的預測（如「若X跌破Y則...」）。不提取模糊陳述（如「市場可能波動」）。
只輸出 JSON 陣列。`;

  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  try {
    const json = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    return Array.isArray(json) ? json : (json.predictions ?? []);
  } catch {
    return [];
  }
}
```

#### Verify predictions next trading day

```typescript
export async function verifyPredictions(
  supabase: SupabaseClient,
  userId: string,
  division: string,
  verifyDate: string,
  provider: MarketDataProvider
): Promise<void> {
  // Get unverified predictions from yesterday
  const yesterday = getPreviousTradingDay(verifyDate);
  const { data: pending } = await supabase
    .from("sim_predictions")
    .select("*")
    .eq("user_id", userId)
    .eq("division", division)
    .eq("verify_date", verifyDate)
    .is("verified_at", null);

  for (const prediction of (pending ?? [])) {
    let conditionMet = false;
    let actionTaken = false;

    if (prediction.condition_type === "price_trigger" && prediction.symbol && prediction.trigger_price) {
      // Did the stock hit the trigger price today?
      const quote = await provider.getQuote(prediction.symbol, prediction.market ?? "US");
      if (prediction.trigger_direction === "below") {
        conditionMet = quote.price < prediction.trigger_price;
      } else if (prediction.trigger_direction === "above") {
        conditionMet = quote.price > prediction.trigger_price;
      }

      if (conditionMet) {
        // Did the division actually make the predicted trade today?
        const { data: trades } = await supabase
          .from("sim_trades")
          .select("action")
          .eq("session_date", verifyDate)
          .eq("symbol", prediction.symbol)
          .in("portfolio_id", /* portfolios for this user+division */[]);

        actionTaken = (trades ?? []).some(t => t.action === prediction.predicted_action);
      }
    }

    await supabase.from("sim_predictions").update({
      condition_met: conditionMet,
      action_taken: actionTaken,
      score_awarded: conditionMet && actionTaken,
      verified_at: new Date().toISOString(),
    }).eq("id", prediction.id);
  }
}
```

---

## Part E: Score Display Component

### File: `src/components/sim-score-card.tsx`

```tsx
type Props = {
  score: SimScore | null;
  division: string;
};

export function SimScoreCard({ score, division }: Props) {
  if (!score) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-950">績效評分</h3>
        <p className="mt-2 text-sm text-slate-400">尚無評分資料。執行每週評估後產生。</p>
      </div>
    );
  }

  const dimensions = [
    { label: "Alpha (超越大盤)", score: score.alpha_score, max: 30, color: "bg-blue-500" },
    { label: "勝率",             score: score.win_rate_score, max: 20, color: "bg-green-500" },
    { label: "風險控制",          score: score.risk_control_score, max: 20, color: "bg-yellow-500" },
    { label: "信心校準",          score: score.conviction_score, max: 15, color: "bg-purple-500" },
    { label: "預測準確",          score: score.prediction_score, max: 15, color: "bg-orange-500" },
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-950">本週績效評分</h3>
        <div className="text-2xl font-bold text-slate-950">
          {score.total_score.toFixed(0)}
          <span className="text-sm font-normal text-slate-400"> / 100</span>
        </div>
      </div>

      {/* Score dimensions */}
      <div className="space-y-2">
        {dimensions.map((dim) => (
          <div key={dim.label}>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>{dim.label}</span>
              <span className="font-medium">{dim.score.toFixed(0)} / {dim.max}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div
                className={`h-1.5 rounded-full ${dim.color}`}
                style={{ width: `${(dim.score / dim.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Badges */}
      {(score.badges as string[])?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
          {(score.badges as string[]).map((badge) => (
            <span key={badge} className="text-xs rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Cumulative */}
      {score.cumulative_total !== null && (
        <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">
          累積平均分數：{score.cumulative_total.toFixed(1)} / 100
        </p>
      )}
    </div>
  );
}
```

---

## Part F: Head-to-Head Comparison (between tabs)

Add a **summary banner** at the top of the simulation page (above the tabs) showing the current standings:

```tsx
{/* Standings banner — always visible above both tabs */}
<div className="rounded-md border border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50 p-4">
  <div className="flex items-center justify-between">
    <div className="text-center">
      <div className="text-sm font-medium text-slate-600">GPT Division</div>
      <div className="text-3xl font-bold text-blue-700">{gptScore ?? "—"}</div>
      <div className="text-xs text-slate-500">本週分數</div>
      {gptLeading && <div className="mt-1 text-xs font-semibold text-blue-600">👑 領先中</div>}
    </div>

    <div className="text-center px-6">
      <div className="text-xs text-slate-400 mb-1">累積對戰</div>
      <div className="text-sm font-semibold text-slate-700">
        GPT {gptWins}勝 — {anthropicWins}勝 ANT
      </div>
      <div className="text-xs text-slate-400 mt-1">
        本週獎章
        {gptBadges.map(b => <span key={b}> {b.split(" ")[0]}</span>)}
        <span className="mx-2">vs</span>
        {anthropicBadges.map(b => <span key={b}>{b.split(" ")[0]} </span>)}
      </div>
    </div>

    <div className="text-center">
      <div className="text-sm font-medium text-slate-600">Anthropic Division</div>
      <div className="text-3xl font-bold text-purple-700">{anthropicScore ?? "—"}</div>
      <div className="text-xs text-slate-500">本週分數</div>
      {anthropicLeading && <div className="mt-1 text-xs font-semibold text-purple-600">👑 領先中</div>}
    </div>
  </div>
</div>
```

---

## Part G: Weekly eval route update

### File: `src/app/api/simulation/weekly-eval/route.ts`

After calculating P&L, call `computeWeeklyScore()` and save to `sim_scores`:

```typescript
import { computeWeeklyScore } from "@/lib/analysis/pipeline/sim-scoring";

for (const division of ["gpt", "anthropic"] as const) {
  const breakdown = await computeWeeklyScore({
    userId,
    division,
    weekStart,
    weekEnd,
    usReturnPct,
    twReturnPct,
    usBenchmarkPct,
    twBenchmarkPct,
    closedTrades: divisionClosedTrades,
    weeklySnapshots: divisionSnapshots,
    predictions: divisionPredictions,
  });

  await supabase.from("sim_scores").upsert({
    user_id: userId,
    division,
    score_date: weekEnd,
    week_start: weekStart,
    week_end: weekEnd,
    alpha_score: breakdown.alpha.score,
    win_rate_score: breakdown.winRate.score,
    risk_control_score: breakdown.riskControl.score,
    conviction_score: breakdown.convictionCalibration.score,
    prediction_score: breakdown.predictionAccuracy.score,
    total_score: breakdown.total,
    badges: breakdown.badges,
    // ... all supporting metrics
  }, { onConflict: "user_id,division,score_date" });
}
```

---

## Summary of all new files

| File | Purpose |
|------|---------|
| `supabase/migrations/202606300010_sim_scoring.sql` | `sim_scores` + `sim_predictions` tables |
| `src/lib/analysis/pipeline/sim-scoring.ts` | `computeWeeklyScore()` — all 5 dimensions |
| `src/lib/analysis/pipeline/sim-predictions.ts` | Extract + verify daily report predictions |
| `src/components/sim-score-card.tsx` | Score card UI with bars + badges |
| `src/app/performance/simulation/page.tsx` | Two-tab dashboard + head-to-head banner |

---

## Score dimension reference

| Dimension | Max | What it measures |
|-----------|-----|-----------------|
| Alpha | 30 | Beat NASDAQ/TAIEX by how much |
| Win Rate | 20 | % of closed trades profitable |
| Risk Control | 20 | Max drawdown this week |
| Conviction Calibration | 15 | Do high-conviction trades win more? |
| Prediction Accuracy | 15 | Daily report predictions → did they follow through? |
| **Total** | **100** | |

## Badges

| Badge | Condition |
|-------|-----------|
| 🏆 本週冠軍 | Total ≥ 85 |
| 💎 完美週 | Total ≥ 95 |
| 📈 大盤終結者 | Alpha avg > 5% |
| ⚡ 高勝率 | Win rate ≥ 70% |
| 🛡️ 穩健風控 | Max drawdown < 3% |
| 🎯 信心校準大師 | Conviction score ≥ 13/15 |
| 🔮 精準預測 | Prediction score ≥ 13/15 |
