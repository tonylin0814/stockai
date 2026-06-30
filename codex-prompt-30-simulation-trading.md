# Codex Prompt 30 — AI Division Paper Trading Simulation

**Goal**: Build a paper trading competition between GPT Division and Anthropic Division. Each division manages two virtual portfolios ($10,000 USD for US market, NT$300,000 for TW market), makes real trades at live prices during configured market hours, with a max of 3 positions per market. Every trade is fully logged with AI reasoning. At end of day each division writes a report. Weekly P&L evaluation compares divisions vs each other and vs benchmark index.

**Apply after**: Prompts 01–29 applied.

---

## Trading Rules

| Rule | Value |
|------|-------|
| Starting budget | $10,000 USD (US) · NT$300,000 (TW) |
| Max open positions | 3 per market (6 total per division) |
| Max position size | 40% of that market's budget |
| Same-day rule | Cannot buy AND sell same symbol on same day |
| Trading hours | User-configurable start/end time (stored in DB) |
| Sessions per day | 1 per division (morning session only) |
| Stop-loss flag | -15% triggers mandatory AI re-evaluation |
| Short selling | Not allowed — long only |
| Commission | $0 (simulation) |

---

## DB Migrations

### File: `supabase/migrations/202606300009_simulation.sql`

```sql
-- Simulation configuration (one per user)
create table if not exists public.sim_config (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  us_start_hour         integer not null default 9,   -- local time hour (24h)
  us_end_hour           integer not null default 16,
  tw_start_hour         integer not null default 9,
  tw_end_hour           integer not null default 14,
  max_positions         integer not null default 3,   -- per market
  max_position_pct      numeric not null default 0.40,
  stop_loss_threshold   numeric not null default 0.15,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

-- One portfolio per division × market
create table if not exists public.sim_portfolios (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  division        text not null,   -- 'gpt' | 'anthropic'
  market          text not null,   -- 'US' | 'TW'
  starting_cash   numeric not null,
  current_cash    numeric not null,
  created_at      timestamptz not null default now(),
  reset_at        timestamptz,
  unique (user_id, division, market)
);

-- Positions (open and closed)
create table if not exists public.sim_positions (
  id              uuid primary key default gen_random_uuid(),
  portfolio_id    uuid not null references public.sim_portfolios(id) on delete cascade,
  symbol          text not null,
  market          text not null,
  name            text not null,
  shares          numeric not null,
  avg_cost_price  numeric not null,
  current_price   numeric,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  status          text not null default 'open',  -- 'open' | 'closed'
  stop_flagged    boolean not null default false  -- true if -15% triggered
);

-- Every trade executed
create table if not exists public.sim_trades (
  id                uuid primary key default gen_random_uuid(),
  portfolio_id      uuid not null references public.sim_portfolios(id) on delete cascade,
  position_id       uuid references public.sim_positions(id),
  action            text not null,   -- 'buy' | 'sell'
  symbol            text not null,
  market            text not null,
  name              text not null,
  shares            numeric not null,
  price_per_share   numeric not null,
  total_amount      numeric not null,  -- shares × price
  -- Full AI analysis that triggered this trade
  thesis            text not null,     -- Main investment thesis (2-4 sentences)
  technical_basis   text not null,     -- SMA, RSI, patterns with actual numbers
  fundamental_basis text,              -- Earnings, revenue, macro factors
  risk_factors      text not null,     -- Key risks identified
  target_price      numeric,
  stop_loss         numeric,
  conviction        integer,           -- 0–100 AI self-rating
  -- Outcome tracking (filled in when position closes or weekly eval)
  outcome_pnl       numeric,
  outcome_pct       numeric,
  -- Metadata
  session_date      date not null,     -- For same-day rule enforcement
  executed_at       timestamptz not null default now(),
  ai_model          text
);

-- End-of-day reports
create table if not exists public.sim_daily_reports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  division            text not null,
  report_date         date not null,
  -- Portfolio snapshot at close
  us_portfolio_value  numeric,
  tw_portfolio_value  numeric,
  us_day_pnl          numeric,
  tw_day_pnl          numeric,
  us_day_pnl_pct      numeric,
  tw_day_pnl_pct      numeric,
  -- AI-written content
  trades_summary      text not null,   -- What trades happened and why
  positions_review    text not null,   -- Review of all open positions
  market_commentary   text not null,   -- Overall market read today
  tomorrow_outlook    text not null,   -- What to watch, potential moves
  planned_actions     text,            -- Specific plans for tomorrow
  -- Raw data
  trades_today        jsonb,
  positions_snapshot  jsonb,
  created_at          timestamptz not null default now(),
  unique (user_id, division, report_date)
);

-- Weekly evaluations
create table if not exists public.sim_weekly_evals (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  division                text not null,
  week_start              date not null,
  week_end                date not null,
  -- US market results
  us_start_value          numeric,
  us_end_value            numeric,
  us_week_return_pct      numeric,
  us_cumulative_return_pct numeric,
  us_benchmark_return_pct numeric,   -- vs NASDAQ
  -- TW market results
  tw_start_value          numeric,
  tw_end_value            numeric,
  tw_week_return_pct      numeric,
  tw_cumulative_return_pct numeric,
  tw_benchmark_return_pct numeric,   -- vs TAIEX
  -- Stats
  trades_count            integer,
  winning_trades          integer,
  losing_trades           integer,
  avg_conviction          numeric,
  best_trade              jsonb,
  worst_trade             jsonb,
  -- AI-written review
  strategy_review         text,   -- What worked, what didn't
  next_week_plan          text,   -- Forward strategy
  created_at              timestamptz not null default now()
);

-- Enable RLS
alter table public.sim_config          enable row level security;
alter table public.sim_portfolios      enable row level security;
alter table public.sim_positions       enable row level security;
alter table public.sim_trades          enable row level security;
alter table public.sim_daily_reports   enable row level security;
alter table public.sim_weekly_evals    enable row level security;

-- RLS policies (users see own data)
create policy "own sim_config"        on public.sim_config        for all using (auth.uid() = user_id);
create policy "own sim_portfolios"    on public.sim_portfolios    for all using (auth.uid() = user_id);
create policy "own sim_positions"     on public.sim_positions     for all using (
  portfolio_id in (select id from public.sim_portfolios where user_id = auth.uid())
);
create policy "own sim_trades"        on public.sim_trades        for all using (
  portfolio_id in (select id from public.sim_portfolios where user_id = auth.uid())
);
create policy "own sim_daily_reports" on public.sim_daily_reports for all using (auth.uid() = user_id);
create policy "own sim_weekly_evals"  on public.sim_weekly_evals  for all using (auth.uid() = user_id);

-- Indexes
create index on public.sim_trades     (portfolio_id, session_date);
create index on public.sim_positions  (portfolio_id, status);
create index on public.sim_daily_reports (user_id, division, report_date desc);
```

---

## API Routes

### POST `/api/simulation/trade-session` — Run a trading session

**File: `src/app/api/simulation/trade-session/route.ts`**

```typescript
export async function POST(request: Request) {
  // 1. Auth check
  // 2. Load sim_config — check if within trading hours
  // 3. Check if session already ran today for this division
  // 4. For each market (US, TW):
  //    a. Load current portfolio (positions, cash)
  //    b. Fetch live quotes for all positions + scan universe candidates
  //    c. Build trading context
  //    d. Call AI for decisions
  //    e. Validate each decision (same-day rule, position limit, cash, position size)
  //    f. Execute valid trades at current price
  //    g. Update sim_positions and sim_portfolios
  //    h. Save to sim_trades with full reasoning
  // 5. Return session summary
}
```

#### Trading hours check

```typescript
function isWithinTradingHours(config: SimConfig, market: "US" | "TW"): boolean {
  const now = new Date();
  const hour = now.getHours(); // use user's local time or UTC+offset
  const startHour = market === "US" ? config.us_start_hour : config.tw_start_hour;
  const endHour = market === "US" ? config.us_end_hour : config.tw_end_hour;
  const dayOfWeek = now.getDay();
  // No trading on weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return hour >= startHour && hour < endHour;
}
```

#### Same-day rule check

```typescript
async function hasSameDayConflict(
  supabase: SupabaseClient,
  portfolioId: string,
  symbol: string,
  intendedAction: "buy" | "sell",
  sessionDate: string
): Promise<boolean> {
  const { data } = await supabase
    .from("sim_trades")
    .select("action")
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .eq("session_date", sessionDate);

  if (!data?.length) return false;
  // If any trade exists today for this symbol with the OPPOSITE action, block it
  const oppositeAction = intendedAction === "buy" ? "sell" : "buy";
  return data.some((t) => t.action === oppositeAction);
}
```

#### Execute a validated trade

```typescript
async function executeTrade(
  supabase: SupabaseClient,
  portfolio: SimPortfolio,
  decision: AiTradeDecision,
  livePrice: number,
  sessionDate: string
): Promise<void> {
  const totalAmount = decision.shares * livePrice;

  if (decision.action === "buy") {
    // Check cash
    if (totalAmount > portfolio.current_cash) throw new Error("Insufficient cash");
    // Check position size limit
    const budget = portfolio.starting_cash; // use starting_cash as budget reference
    if (totalAmount > budget * 0.40) throw new Error("Exceeds 40% position size limit");

    // Upsert position (might be adding to existing)
    const { data: existing } = await supabase
      .from("sim_positions")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .eq("symbol", decision.symbol)
      .eq("status", "open")
      .maybeSingle();

    let positionId: string;
    if (existing) {
      // Average down/up
      const newShares = existing.shares + decision.shares;
      const newAvgCost = (existing.shares * existing.avg_cost_price + totalAmount) / newShares;
      const { data: updated } = await supabase
        .from("sim_positions")
        .update({ shares: newShares, avg_cost_price: newAvgCost, current_price: livePrice })
        .eq("id", existing.id)
        .select("id")
        .single();
      positionId = updated!.id;
    } else {
      // New position
      const { data: created } = await supabase
        .from("sim_positions")
        .insert({
          portfolio_id: portfolio.id,
          symbol: decision.symbol,
          market: decision.market,
          name: decision.name,
          shares: decision.shares,
          avg_cost_price: livePrice,
          current_price: livePrice,
        })
        .select("id")
        .single();
      positionId = created!.id;
    }

    // Deduct cash
    await supabase
      .from("sim_portfolios")
      .update({ current_cash: portfolio.current_cash - totalAmount })
      .eq("id", portfolio.id);

    // Record trade
    await supabase.from("sim_trades").insert({
      portfolio_id: portfolio.id,
      position_id: positionId,
      action: "buy",
      symbol: decision.symbol,
      market: decision.market,
      name: decision.name,
      shares: decision.shares,
      price_per_share: livePrice,
      total_amount: totalAmount,
      thesis: decision.thesis,
      technical_basis: decision.technicalBasis,
      fundamental_basis: decision.fundamentalBasis ?? null,
      risk_factors: decision.riskFactors,
      target_price: decision.targetPrice ?? null,
      stop_loss: decision.stopLoss ?? null,
      conviction: decision.conviction,
      session_date: sessionDate,
      ai_model: decision.aiModel,
    });

  } else if (decision.action === "sell") {
    const { data: position } = await supabase
      .from("sim_positions")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .eq("symbol", decision.symbol)
      .eq("status", "open")
      .single();

    if (!position) throw new Error(`No open position for ${decision.symbol}`);
    const sharesToSell = Math.min(decision.shares, position.shares);
    const proceeds = sharesToSell * livePrice;
    const costBasis = sharesToSell * position.avg_cost_price;
    const pnl = proceeds - costBasis;
    const pnlPct = pnl / costBasis;

    // Close or reduce position
    if (sharesToSell >= position.shares) {
      await supabase
        .from("sim_positions")
        .update({ status: "closed", closed_at: new Date().toISOString(), current_price: livePrice })
        .eq("id", position.id);
    } else {
      await supabase
        .from("sim_positions")
        .update({ shares: position.shares - sharesToSell, current_price: livePrice })
        .eq("id", position.id);
    }

    // Add proceeds to cash
    await supabase
      .from("sim_portfolios")
      .update({ current_cash: portfolio.current_cash + proceeds })
      .eq("id", portfolio.id);

    // Record trade with outcome
    await supabase.from("sim_trades").insert({
      portfolio_id: portfolio.id,
      position_id: position.id,
      action: "sell",
      symbol: decision.symbol,
      market: decision.market,
      name: decision.name,
      shares: sharesToSell,
      price_per_share: livePrice,
      total_amount: proceeds,
      thesis: decision.thesis,
      technical_basis: decision.technicalBasis,
      fundamental_basis: decision.fundamentalBasis ?? null,
      risk_factors: decision.riskFactors,
      conviction: decision.conviction,
      outcome_pnl: pnl,
      outcome_pct: pnlPct,
      session_date: sessionDate,
      ai_model: decision.aiModel,
    });
  }
}
```

---

### POST `/api/simulation/end-of-day` — Generate daily reports

**File: `src/app/api/simulation/end-of-day/route.ts`**

For each division, call AI to write the daily report:

```typescript
// Build report context
const reportContext = {
  division,
  date: today,
  tradesToday: todaysTrades,  // all trades from today's session
  openPositions: openPositions.map(p => ({
    symbol: p.symbol,
    name: p.name,
    shares: p.shares,
    avgCost: p.avg_cost_price,
    currentPrice: p.current_price,
    unrealizedPnl: (p.current_price - p.avg_cost_price) * p.shares,
    unrealizedPct: (p.current_price - p.avg_cost_price) / p.avg_cost_price,
    stopFlagged: p.stop_flagged,
  })),
  usCash: usPortfolio.current_cash,
  twCash: twPortfolio.current_cash,
  usPortfolioValue: usPortfolioValue,
  twPortfolioValue: twPortfolioValue,
  usDayPnl: usDayPnl,
  twDayPnl: twDayPnl,
};
```

#### Daily report AI prompt

```
你是 ${division === "gpt" ? "GPT Division" : "Anthropic Division"} 的投資組合經理，今日交易結束，撰寫每日報告。

## 今日數據

日期：${date}

### 今日操作
${tradesToday.length === 0 ? "今日無交易" : tradesToday.map(t => 
  `${t.action === "buy" ? "買入" : "賣出"} ${t.symbol} ${t.name} ${t.shares}股 @ ${t.price_per_share}
   理由：${t.thesis}`
).join("\n\n")}

### 當前持倉
${openPositions.map(p =>
  `${p.symbol} ${p.name}: ${p.shares}股，成本${p.avgCost}，現價${p.currentPrice}，${p.unrealizedPct >= 0 ? "+" : ""}${(p.unrealizedPct * 100).toFixed(2)}%${p.stopFlagged ? " ⚠️ 已觸發停損警示" : ""}`
).join("\n")}

### 資金狀況
美股現金：$${usCash.toFixed(2)} / 台股現金：NT$${twCash.toFixed(0)}
今日損益：美股 $${usDayPnl.toFixed(2)} / 台股 NT$${twDayPnl.toFixed(0)}

## 請撰寫報告，包含以下四個部分（JSON格式輸出）：

{
  "trades_summary": "今日操作回顧：說明每筆交易的決策邏輯，為何選擇這個時機，基於什麼分析。如無交易，說明為何選擇觀望。（100-200字）",
  "positions_review": "持倉檢視：逐一評估每個持倉的當前狀況，是否符合原本預期，有無需要注意的訊號。（100-200字）",
  "market_commentary": "大盤看法：今日市場整體走勢評估，影響持倉的主要因素。（50-100字）",
  "tomorrow_outlook": "明日展望：明天需要關注什麼，哪些持倉可能有動作，什麼條件下會買進或賣出。具體說明。（100-150字）",
  "planned_actions": "明日計劃：具體說明若明日開盤出現什麼情況，會採取什麼行動。例：'若AAPL開盤跌破185，考慮減碼一半'（可選，50-100字）"
}
```

---

### POST `/api/simulation/weekly-eval` — Weekly evaluation

**File: `src/app/api/simulation/weekly-eval/route.ts`**

Runs every Friday after market close (or manually triggered):

1. Calculate portfolio values for the week
2. Fetch benchmark returns (NASDAQ for US, TAIEX for TW)
3. Calculate win rate from trades this week
4. Call AI to write strategy review and next week plan
5. Save to `sim_weekly_evals`

---

### POST `/api/simulation/reset` — Reset portfolios

Allows user to reset back to starting budgets (clears all positions and trades, keeps history for reference).

---

## AI Trading Decision Prompt

### File: `src/lib/analysis/prompts/sim-trading.ts`

```typescript
export function buildTradingDecisionPrompt(
  division: "gpt" | "anthropic",
  market: "US" | "TW",
  context: TradingContext
): string {
  const currency = market === "US" ? "USD" : "NTD";
  const maxPositions = 3;

  const positionsText = context.openPositions.length === 0
    ? "（無持倉）"
    : context.openPositions.map(p => {
        const pnl = (p.currentPrice - p.avgCost) / p.avgCost * 100;
        const stopFlag = p.stopFlagged ? " ⚠️ 已觸發-15%停損警示，必須決定是否繼續持有" : "";
        return `${p.symbol} ${p.name}: ${p.shares}股 | 成本${p.avgCost} | 現價${p.currentPrice} | ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%${stopFlag}
  技術：SMA20=${p.sma20 ?? "N/A"} SMA60=${p.sma60 ?? "N/A"} RSI=${p.rsi14 ?? "N/A"}`;
      }).join("\n");

  const candidatesText = context.candidates.map(c =>
    `${c.symbol} ${c.name} | 現價:${c.price} | 今日${c.changePct >= 0 ? "+" : ""}${c.changePct.toFixed(2)}% | SMA20:${c.sma20 ?? "N/A"} SMA60:${c.sma60 ?? "N/A"} RSI:${c.rsi14 ?? "N/A"} | 52W低:${c.weekLow52 ?? "N/A"} 52W高:${c.weekHigh52 ?? "N/A"}`
  ).join("\n");

  const todayTradesText = context.todayTrades.length === 0
    ? "（今日尚無操作）"
    : context.todayTrades.map(t =>
        `${t.action === "buy" ? "買入" : "賣出"} ${t.symbol} ${t.shares}股 @ ${t.pricePerShare}`
      ).join("\n");

  return `你是 ${division === "gpt" ? "GPT Division" : "Anthropic Division"} 的 ${market} 市場交易員。

## 當前狀況

可用現金：${currency === "USD" ? "$" : "NT$"}${context.availableCash.toFixed(2)}
持倉數量：${context.openPositions.length} / ${maxPositions} 個

## 當前持倉
${positionsText}

## 今日已執行操作（同一標的今日不得反向操作）
${todayTradesText}

## 市場候選標的
${candidatesText}

## 大盤環境
${market === "US" 
  ? `S&P 500: ${context.indexPrice} (${context.indexChangePct >= 0 ? "+" : ""}${context.indexChangePct.toFixed(2)}%) | VIX: ${context.vix}`
  : `加權指數: ${context.indexPrice} (${context.indexChangePct >= 0 ? "+" : ""}${context.indexChangePct.toFixed(2)}%)`
}

## 交易規則（嚴格遵守）
1. 最多持有 ${maxPositions} 個部位 — 現有 ${context.openPositions.length} 個，最多可新增 ${maxPositions - context.openPositions.length} 個
2. 同一標的今日若已買，不得賣；今日若已賣，不得買
3. 單一部位不得超過起始資金的 40%（${currency === "USD" ? "$" : "NT$"}${(context.startingBudget * 0.4).toFixed(0)}）
4. 只能做多（買入），不可做空
5. 賣出時只能賣已持有的股數

## 你的任務

根據技術分析和市場環境，決定今日操作。輸出 JSON：

{
  "decisions": [
    {
      "action": "buy" | "sell" | "hold",
      "symbol": "AAPL",
      "market": "${market}",
      "name": "Apple Inc.",
      "shares": 5,
      "thesis": "主要投資理由（2-3句，說明為何現在是好時機）",
      "technicalBasis": "具體技術分析（必須包含SMA/RSI實際數字，例：突破SMA60=185.3，RSI=58未過熱）",
      "fundamentalBasis": "基本面因素（可選）",
      "riskFactors": "主要風險（1-2條）",
      "targetPrice": 195.0,
      "stopLoss": 178.0,
      "conviction": 72
    }
  ],
  "noActionReason": "若不採取任何行動，說明原因（可選）",
  "marketAssessment": "對今日市場的整體看法（1-2句）"
}

規則：
- "hold" 動作不需要 shares/thesis 等欄位，只需 symbol 和 action
- 若持倉有停損警示（⚠️），必須在 decisions 中包含該標的（hold 或 sell）
- conviction 介於 50–85
- targetPrice 和 stopLoss 必須是具體數字
- shares 必須是整數，且總金額不超過可用現金和 40% 限制
- 只輸出 JSON`;
}
```

---

## Pages

### `/performance/simulation` — Main simulation page

**File: `src/app/performance/simulation/page.tsx`**

```
績效 > 模擬交易競賽

[GPT Division] vs [Anthropic Division]                [執行今日交易] [產生日報] [每週評估]

─── 本週成績 ───────────────────────────────────────────────────────────
              GPT Division          Anthropic Division      差異
美股本週        +$342.50 (+3.43%)    +$185.20 (+1.85%)      GPT +1.58%
台股本週        +NT$8,200 (+2.73%)   +NT$12,400 (+4.13%)    ANT +1.40%
──────────────────────────────────────────────────────────────────────

─── 美股持倉 ────────────────────────────────────────────────────────────
GPT Division ($7,342.50 現金)         Anthropic Division ($6,818.00 現金)
NVDA 2股 | 成本$875 | 現$912 +4.2%   AAPL 5股 | 成本$182 | 現$184 +1.1%
AAPL 5股 | 成本$182 | 現$184 +1.1%   MSFT 3股 | 成本$415 | 現$428 +3.1%

─── 台股持倉 ────────────────────────────────────────────────────────────
GPT Division (NT$210,500 現金)        Anthropic Division (NT$195,200 現金)
2330 1股 | 成本920 | 現947 +2.9%      2454 2股 | 成本910 | 現935 +2.7%

─── 今日日報 ────────────────────────────────────────────────────────────
[GPT Division 日報] [Anthropic Division 日報]    (tab switcher)

今日操作：
買入 NVDA 2股 @ $875.00（2026-07-01 10:23）
理由：突破SMA60=855，RSI=58，AI晶片需求強勁，目標$950（+8.6%），停損$840（-4%）

持倉檢視：...

明日展望：...

─── 交易歷史 ────────────────────────────────────────────────────────────
[篩選: 全部 | 買入 | 賣出] [GPT | Anthropic] [美股 | 台股]

日期     Division  動作  代號   股數  成交價   金額      損益      信心
07-01   GPT       買入  NVDA   2     $875    $1,750    —         78
07-01   ANT       買入  AAPL   5     $182    $910      —         65
06-28   GPT       賣出  TSLA   3     $240    $720      +$62(+9%) 71
```

Show sections in order:
1. Weekly comparison header (GPT vs Anthropic, both markets)
2. Current positions side-by-side (US then TW)
3. Today's daily report (tabbed by division)
4. Trade history table (filterable)
5. Weekly evaluation history

---

### `/performance/simulation/trade/[id]` — Trade detail page

Shows full reasoning for a single trade:

```
← 回模擬交易                                                    2026-07-01 10:23

GPT Division — 買入 NVDA                              信心指數: 78/100

成交價 $875.00 × 2股 = $1,750.00
目標價 $950.00 (+8.6%)    停損 $840.00 (-4.0%)

─── 投資論點 ─────────────────────────────────────────────────────────
突破季線(SMA60=855)後站穩，AI伺服器需求強勁，本季財報預期EPS上調12%。
下週輝達開發者大會可能帶來正面催化劑。

─── 技術分析 ─────────────────────────────────────────────────────────
• SMA20=869（現價在SMA20上方 +0.7%）
• SMA60=855（突破，做多確認）
• RSI=58（偏強，未過熱）
• 今日成交量 1.6x 均量（放量突破）

─── 基本面 ───────────────────────────────────────────────────────────
• 上季EPS $5.98，本季預估 $6.72（+12.4%）
• 資料中心營收年增 154%

─── 風險因素 ─────────────────────────────────────────────────────────
• 中美晶片出口管制若加劇，訂單能見度下降
• 估值已高（PE=45x），任何負面消息反應劇烈

─── 後續追蹤 ─────────────────────────────────────────────────────────
狀態: 持有中
現價: $912.00 (+$37.00, +4.23%)
持倉至今: 3天
```

---

## Action buttons

Three buttons on the simulation page, each calls a different API route:

```tsx
<SimActionButton href="/api/simulation/trade-session" method="POST" label="執行今日交易" />
<SimActionButton href="/api/simulation/end-of-day"   method="POST" label="產生日報" />
<SimActionButton href="/api/simulation/weekly-eval"  method="POST" label="每週評估" />
```

Each button should:
- Show a loading state while running
- Display a success/error toast when done
- Refresh the page on completion

---

## Initialize portfolios

On first visit to `/performance/simulation`, if no portfolios exist for this user, auto-create them:

```typescript
// Create 4 portfolios (2 divisions × 2 markets)
const portfoliosToCreate = [
  { division: "gpt",       market: "US", starting_cash: 10000,  current_cash: 10000 },
  { division: "gpt",       market: "TW", starting_cash: 300000, current_cash: 300000 },
  { division: "anthropic", market: "US", starting_cash: 10000,  current_cash: 10000 },
  { division: "anthropic", market: "TW", starting_cash: 300000, current_cash: 300000 },
];
```

Also create default `sim_config` with trading hours 9:00–16:00.

---

## Notes for Codex

- The `executeTrade` function must be wrapped in a try/catch — if execution fails for one trade, continue with the others (don't abort the whole session)
- `session_date` on `sim_trades` uses server date in YYYY-MM-DD format — used for same-day rule, not timestamp
- Stop-loss flag check: after fetching live quotes for positions, if `(currentPrice - avgCostPrice) / avgCostPrice < -0.15`, set `stop_flagged = true` on that position before building the AI prompt
- The weekly eval should compare vs NASDAQ close-to-close for the same 5-day period; use `provider.getHistory("^IXIC", "US", 7)` and `provider.getHistory("TAIEX", "TW", 7)` to get benchmark returns
- Trade candidates for the trading prompt: use existing open position symbols + 10 candidates from the US/TW scan universe (from `tw-universe.ts` and `us-universe.ts` created in Prompt 29)
- The `ai_model` field should capture which model was used (e.g., "gpt-4o" or "claude-3-5-sonnet")
- Daily report generation should NOT require an active trading session — it can be run after hours
