# Claude Supervisor Briefing for Codex
## 台美股投資決策系統 — Build Instructions

---

## 0. Roles & Workflow

| Role | Who | Responsibility |
|---|---|---|
| **Owner** | Tony | Decides product direction, provides feedback, runs Codex |
| **Supervisor** | Claude | Reviews the plan, makes architectural decisions, writes build instructions, reviews Codex output, catches problems, issues corrections |
| **Builder** | Codex | Executes every build instruction exactly as written. Does not make architectural decisions independently. |

**Workflow:**
```
Claude writes instruction → Codex builds → Tony brings output to Claude → Claude reviews → Claude writes next instruction or correction → repeat
```

Claude does not write code. Claude tells Codex exactly what to build, in what order, to what standard. When Codex output is wrong or incomplete, Tony brings it back to Claude for a corrected instruction.

---

## 1. Project Summary

A web-deployed,繁體中文 investment decision platform for Taiwan (TWSE/TPEX) and US (NYSE/NASDAQ) stocks.

The system uses multiple AI divisions — each with 5 specialist teams — that independently analyze the same data and reach conclusions. A cross-division committee requires consensus before any action is recommended. This design reduces single-model bias and raises decision quality.

**Primary user:** Tony (personal use, single account for now, architecture supports multi-user)

**Full product spec:** See `investment-web-app-plan.md` — read it completely. The sections below override or supplement that document where there are conflicts.

---

## 2. Confirmed Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | |
| Styling | Tailwind CSS + shadcn/ui | |
| Icons | lucide-react | |
| Charts | Recharts (portfolio/performance) + Lightweight Charts (price/candlestick) | |
| Database | Supabase Postgres | Cloud-hosted, RLS enabled |
| Auth | Supabase Auth (email/password) | No OAuth needed for Stage 1 |
| AI — Division 1 | OpenAI GPT 5.5 | Monica (GPT Division Manager) |
| AI — Division 2 | Anthropic Claude (latest Sonnet) | Claire Shen (Claude Division Manager) |
| Validation | Zod | All AI JSON outputs must be validated |
| Deployment | Vercel or equivalent | Web-deployed, not local |

---

## 3. Division Architecture — Stage 1

Start with **2 divisions** from day one. This immediately satisfies the consensus rule.

```
Daily Data Package / Mission Package
          |
          v
GPT Division          Claude Division
(Monica / GPT 5.5)    (Claire / Claude Sonnet)
5 Teams               5 Teams
          |                  |
          v                  v
  GPT Division         Claude Division
   Decision              Decision
          \                  /
           \                /
            v              v
     Cross-Division Investment Committee
                  |
                  v
        Final Action / No Action
```

**Consensus Rule (Stage 1 with 2 divisions):**
- Both divisions agree → Strong Consensus → Action allowed
- Only one agrees → Weak Consensus → No new action, add to watchlist
- Neither agrees → No Consensus → No action

**Gemini Division:** Phase 2. Do not build now. Schema must reserve space for it.

**Division seed data (insert at schema setup):**

```
Division 1:
- name: GPT Division
- manager_name: Monica
- model_provider: OpenAI
- model_name: gpt-5.5
- brain_description: GPT 5.5 reasoning brain
- is_enabled: true
- participates_in_committee: true
- sort_order: 1

Division 2:
- name: Claude Division
- manager_name: 沈孟潔 Claire Shen
- model_provider: Anthropic
- model_name: claude-sonnet-latest
- brain_description: Claude Sonnet reasoning brain
- is_enabled: true
- participates_in_committee: true
- sort_order: 2
```

Each division must have all 5 teams seeded under it (same team names, different division_id):
1. 基本面品質團隊 — Leader: 林品妍 Sophia Lin
2. 技術量價團隊 — Leader: 陳昱翔 Marcus Chen
3. 總經產業團隊 — Leader: 王若庭 Vivian Wang
4. 事件催化團隊 — Leader: 張以安 Ethan Chang
5. 風險控管團隊 — Leader: 許承睿 Daniel Hsu

---

## 4. Schema Corrections

The plan's schema is mostly correct. Apply these fixes before writing any migration:

### Fix 1 — `recommendations` table: replace polymorphic FK

**Remove:**
```sql
source_id uuid,
```

**Replace with:**
```sql
team_report_id        uuid references team_reports(id),
division_decision_id  uuid references division_decisions(id),
committee_decision_id uuid references committee_decisions(id),
```

Only one of these three will be non-null per row. This makes joins reliable and the schema enforceable.

### Fix 2 — RLS on every user-data table

Every table that contains `user_id` must have RLS enabled and a policy that restricts reads/writes to the authenticated user. No exceptions. Do not expose any user data without RLS.

### Fix 3 — `securities` unique constraint

The plan specifies `(symbol, market)` as unique. Enforce this as a Postgres unique constraint, not just a comment:

```sql
UNIQUE (symbol, market)
```

This prevents duplicate entries when the same symbol is added from different data sources.

---

## 5. Data Sources — Critical Constraints

Build a `MarketDataProvider` abstraction interface on day one. Every data fetch goes through this interface. This allows swapping providers without touching analysis logic.

```typescript
interface MarketDataProvider {
  getQuote(symbol: string, market: 'US' | 'TW'): Promise<Quote>
  getHistory(symbol: string, market: 'US' | 'TW', days: number): Promise<OHLCV[]>
  getNews(symbol: string): Promise<NewsItem[]>
  getFundamentals(symbol: string, market: 'US' | 'TW'): Promise<Fundamentals>
  getIndex(symbol: string): Promise<Quote>
  getFXRate(base: string, quote: string): Promise<number>
  getMacro(seriesId: string): Promise<MacroDataPoint[]>
}
```

### Data Source Table

| Source | Use | Free Limit | Key Required |
|---|---|---|---|
| Finnhub | US quotes, news, fundamentals | 60 req/min | Yes (free) |
| Alpha Vantage | US historical, technicals, FX backup | **25 req/DAY** | Yes (free) |
| TWSE OpenAPI | Taiwan stocks, indices, announcements | Undocumented — add retry + backoff | No |
| TPEx OpenAPI | OTC Taiwan stocks | Same caution as TWSE | No |
| FRED API | US macro (rates, inflation, yields, GDP) | Generous | Yes (free) |
| Frankfurter | USD/TWD FX rates | Unlimited | No |
| yahoo-finance2 (npm) | Fallback for both US + Taiwan (.TW suffix) | Unofficial | No |

### Alpha Vantage Warning — 25 req/DAY
This is the tightest constraint in the system. Design rules:
- Cache every Alpha Vantage response to Supabase immediately on fetch
- Never call Alpha Vantage twice for the same data on the same calendar day
- Check Supabase cache first, call API only on cache miss
- If daily limit is hit, use cached data and mark as `delayed`
- Log every Alpha Vantage call to `data_fetch_logs`

### Taiwan Stock Data Reality
True real-time Taiwan stock quotes require a paid license. Stage 1 uses:
- TWSE/TPEx official end-of-day data (free, official)
- yahoo-finance2 with `.TW` suffix as near-real-time fallback (e.g., `2330.TW` = TSMC)
- All Taiwan data must be labeled with its update timestamp in the UI
- Do not present delayed data as real-time

---

## 6. AI Pipeline Design

### Call Budget Per Full Daily Run
```
5 teams × 4 agents     = 20 agent calls
5 team leaders         =  5 calls
2 division managers    =  2 calls
1 committee            =  1 call
─────────────────────────────────────
Total                  = 28 API calls (split ~14 OpenAI / ~14 Anthropic)
```

Both divisions run in **parallel** (Promise.all), not sequential. This cuts wall-clock time roughly in half.

Within each division, the 5 teams also run in **parallel**. Agent calls within each team run **sequentially** (agents feed into the team leader).

### When AI Runs
| Trigger | Action |
|---|---|
| Timer refresh | Data fetch only — no AI calls |
| Manual daily run | Full 28-call pipeline |
| Mission run | Full pipeline scoped to mission target |
| Data unchanged | Prompt user before re-running AI |

### JSON Contract — Non-Negotiable
Every agent, team leader, division manager, and committee must output valid JSON matching the schema defined in Section 4.7 of the plan. Enforce with Zod on every output.

```
Agent output → Zod validation → pass: store | fail: attempt JSON repair → pass: store | fail: mark agent_run as failed
```

Never use a failed or unvalidated output to generate a recommendation.

### Confidence Rules
- Monica / Claire confidence cap: **60** when any key data is `stale` or `conflicting`
- No `buy` or `small_buy` action allowed if confidence < **70**
- If critical data is `missing`: output must be `wait` or `insufficient_data`, never a buy recommendation

---

## 7. Data Quality States

Every piece of data in the system must carry one of these states:

| State | Meaning | Rule |
|---|---|---|
| `fresh` | Updated within acceptable window | Normal use |
| `delayed` | Available but not real-time | Usable, must be labeled |
| `stale` | Too old for reliable analysis | Caps AI confidence at 60 |
| `missing` | Not available | AI must output wait/insufficient |
| `conflicting` | Two sources disagree >1% | Caps AI confidence at 60 |

Staleness thresholds:
- US quotes: `delayed` after 30 min, `stale` after 1 trading day
- Taiwan quotes: `delayed` always (end-of-day), `stale` after 2 trading days
- Fundamentals: `delayed` after 1 quarter
- News: event team lowers confidence after 24 hrs without update

---

## 8. Pending Decisions — Resolved

These were open in Section 12 of the plan. All resolved:

| Decision | Answer |
|---|---|
| Database | Supabase (cloud, with auth + RLS) |
| Login | Supabase Auth, email/password |
| US primary data source | Finnhub |
| Taiwan primary data source | TWSE/TPEx official + yahoo-finance2 fallback |
| Daily run time | Manual trigger for Stage 1. Timer option: user sets in Settings |
| Notifications | Dashboard alerts only in Stage 1. Email/LINE/Telegram in Phase 2 |
| Teams recommend < 3 in high-risk markets | Allowed — must include written explanation |
| Monica/Claire can veto all teams and choose wait | Yes — this must always be possible |
| Backtesting | Schema reserved, not built in Stage 1 |
| Gemini Division | Phase 2 only |
| Broker integration | Not in scope |

---

## 9. Build Order — Phase by Phase

**Do not start the next phase until the current phase passes its validation gate.**

---

### Phase 1 — Foundation
**Goal:** A working app where a user can log in, manage their portfolio and watchlist, and see live market data. No AI yet.

Tasks:
1. Initialize Next.js 14 project with TypeScript, Tailwind, shadcn/ui, Supabase client
2. Build complete Supabase schema from plan Section 7.4 with all schema fixes from Section 4 above
3. Apply RLS policies to all user-data tables
4. Seed `divisions` and `division_teams` tables
5. Implement Supabase Auth (sign up, sign in, sign out)
6. Build Portfolio CRUD (add, edit, delete holdings)
7. Build Watchlist CRUD (add, edit, delete items)
8. Build MarketDataProvider abstraction + implement Finnhub + TWSE + yahoo-finance2
9. Build Market Overview page: TAIEX, S&P 500, NASDAQ, Dow Jones, VIX, USD/TWD
10. Display current price + unrealized P&L on Portfolio page

**Validation gate:** User can log in → add holdings → see live prices and P&L → add watchlist items. All data labeled with source and update time. No console errors.

---

### Phase 2 — AI Pipeline
**Goal:** Both divisions run a full daily analysis and store structured results.

Tasks:
1. Build daily data package assembler (portfolio, watchlist, market snapshot, prices, news, FX)
2. Build prompt templates for all 5 agent types × 2 divisions (same structure, different model)
3. Build team pipeline: 4 agents → team leader → JSON output per team
4. Build division pipeline: 5 team reports → division manager → division decision JSON
5. Build committee: 2 division decisions → consensus check → final action JSON
6. Implement Zod schemas for all output types
7. Implement JSON repair + failure marking
8. Store all outputs: `agent_runs`, `team_reports`, `division_decisions`, `committee_decisions`, `recommendations`
9. Build Daily Analysis page: show team reports, division decisions, committee final output
10. Build prompt versioning (store prompt key + version in `agent_runs`)

**Validation gate:** Full daily run completes for both divisions in parallel. All outputs stored to Supabase with valid JSON. Committee produces a final_action. Recommendations written to `recommendations` table with all required fields.

---

### Phase 3 — Mission Center
**Goal:** User can create a mission (e.g., "Analyze NVDA") and get a full two-division analysis.

Tasks:
1. Build Mission CRUD (create, view, cancel)
2. Build mission data package assembler (scoped to mission target)
3. Reuse division pipeline from Phase 2, accept mission data package as input
4. Build Mission result page: team reports tabs, division comparison, committee decision
5. Store mission to `missions` table, link to `team_reports`, `division_decisions`, `committee_decisions`
6. Add 7d/30d/90d follow-up tracking fields

**Validation gate:** User creates mission "Analyze TSMC" → both divisions run → committee outputs action → result page shows all team reports and final decision → stored in Supabase.

---

### Phase 4 — Performance & Influence Points
**Goal:** System tracks accuracy of every recommendation over time and updates influence points.

Tasks:
1. Build scheduled job: every day, check `recommendations` where 7d/30d/90d evaluation date has passed
2. Fetch actual price at evaluation date, compute return, drawdown, direction_correct, hit_target, hit_stop_loss
3. Write results to `recommendation_outcomes`
4. Compute influence points per formula from plan Section 14.4:
   ```
   Influence Points = 0.35 × Accuracy + 0.25 × Return + 0.25 × Risk Control + 0.15 × Confidence Calibration
   ```
5. Write daily snapshots to `performance_snapshots` and `influence_scores`
6. Build Performance Dashboard: team accuracy, division accuracy, committee accuracy, influence leaderboard
7. Build Call History table with all recommendation outcomes

**Validation gate:** After 7 days of daily runs, first batch of 7d outcomes appears correctly computed. Influence points update. Performance Dashboard shows real data.

---

### Phase 5 — Polish & Reliability
**Goal:** Production-ready reliability, alerts, explainability, paper trading.

Tasks:
1. Dashboard alert system (price hit buy zone, target hit, stop loss hit, data stale, API failure)
2. Paper trading records (simulate entry on recommendation, track open/closed/hit status)
3. User feedback on recommendations (useful/not useful/too aggressive/too conservative/etc.)
4. Full mobile responsive pass (test all pages on mobile viewport)
5. Playwright visual test suite (desktop + mobile, Chinese text overflow, table readability)
6. Error boundaries on all pages
7. API rate limit monitor (warn when Alpha Vantage approaching 25/day)
8. Cost logging (token count per agent_run, daily total cost estimate)

---

## 10. Non-Negotiable Quality Rules

These apply from Phase 1 onward. Codex must not skip these:

1. **Every AI output validated with Zod before storage.** No exceptions.
2. **Every recommendation must have:** action, buy_zone, target_price, stop_loss, confidence, reason. Empty fields are not allowed.
3. **Data quality state stored and shown in UI.** Never show data without a freshness indicator.
4. **Full audit trail.** Every `agent_run` records: model_name, prompt_version, input_summary, output, token_count, started_at, completed_at.
5. **Skeptic agent must output at least one concern.** If no concerns found, must explicitly state why.
6. **Monica / Claire must state which team reports they accepted and which they rejected, with reasons.**
7. **Committee must state which division was most conservative and which was most aggressive.**
8. **JSON repair attempted once on invalid output. If repair fails, mark run as failed — do not use.**
9. **No buy/small_buy if confidence < 70.**
10. **No high-confidence recommendation if data is stale, missing, or conflicting.**

---

## 11. Pages Reference

From plan Section 8 — build in this order:

| Priority | Route | Description |
|---|---|---|
| Phase 1 | `/dashboard` | Total market value, today P&L, market summary |
| Phase 1 | `/portfolio` | Holdings with live price + P&L |
| Phase 1 | `/watchlist` | Watchlist with target prices |
| Phase 1 | `/markets` | Taiwan + US indices, sector performance |
| Phase 2 | `/analysis/daily` | Daily team reports + committee decision |
| Phase 2 | `/analysis/cio` | Committee decision detail view |
| Phase 3 | `/missions` | Mission list |
| Phase 3 | `/missions/[id]` | Single mission result |
| Phase 4 | `/performance` | Overall performance summary |
| Phase 4 | `/performance/teams` | Team accuracy + influence points |
| Phase 4 | `/performance/divisions` | Division comparison |
| Phase 4 | `/performance/history` | All recommendations with outcomes |
| Phase 5 | `/reports` | Historical daily reports |
| Phase 5 | `/settings` | User preferences, API keys, risk limits |

---

## 12. Environment Variables

Codex must set up `.env.local` with these keys. Tony provides the values.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Data Sources
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
FRED_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

Keys Tony needs to obtain (all free):
- Supabase project → supabase.com
- OpenAI API key → platform.openai.com
- Anthropic API key → console.anthropic.com
- Finnhub free key → finnhub.io
- Alpha Vantage free key → alphavantage.co
- FRED free key → fred.stlouisfed.org

---

## 13. What Codex Does NOT Decide

Codex must not make these decisions independently. Bring them to Claude (supervisor):

- Changing the division architecture or consensus rules
- Changing which AI models are used
- Changing the database schema structure
- Changing the output JSON contracts
- Choosing between data providers when the plan is ambiguous
- Adding features not in the plan or this document
- Changing the build order

When Codex is unsure about an architectural decision, it must stop and flag it. Tony brings it to Claude for a ruling.

---

## 14. First Instruction to Codex

> **Phase 1, Task 1 — Project Setup + Database Schema**
>
> 1. Initialize a Next.js 14 (App Router) project with TypeScript, Tailwind CSS, and shadcn/ui. Install: `@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`, `lucide-react`, `recharts`, `lightweight-charts`, `zod`, `yahoo-finance2`.
>
> 2. Create a Supabase project. Build the complete database schema from Section 7.4 of `investment-web-app-plan.md`. Apply all three schema fixes from Section 4 of this document.
>
> 3. Enable RLS on every table that has a `user_id` column. Write and apply basic RLS policies (users can only read/write their own rows).
>
> 4. Seed the `divisions` table with GPT Division and Claude Division as specified in Section 3 of this document.
>
> 5. Seed `division_teams` with all 5 teams under each division.
>
> 6. Output: the complete SQL migration file, a list of all tables created, confirmation that RLS is enabled on each user-data table, and the seeded division + team data.
>
> Do not build any UI. Do not build any API routes. Schema and seed data only.
>
> Bring the SQL migration output to Claude for review before running it.

---

*Document prepared by Claude (Supervisor) for Codex (Builder)*
*Project: 台美股投資決策系統*
*Owner: Tony*
