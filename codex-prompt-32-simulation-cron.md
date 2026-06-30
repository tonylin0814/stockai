# Codex Prompt 32 — Simulation Cron Endpoint & Automation

## Goal

The paper trading simulation currently requires manual button clicks. We need to automate it so trades, reports, and weekly evaluations run on schedule without user interaction.

The blocker: existing API routes authenticate via Supabase browser cookies — a scheduled job has no browser session. We need to:

1. Extract the core logic from the three simulation routes into shared lib files
2. Create a new `/api/simulation/cron` endpoint that authenticates via a secret header and runs for all active users
3. Add `CRON_SECRET` to the environment

---

## Step 1 — Create shared simulation lib files

### `src/lib/simulation/run-trade.ts`

Extract the trading logic from `src/app/api/simulation/trade-session/route.ts` into this file.

Export one function:

```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildTradingDecisionPrompt } from "@/lib/analysis/prompts/sim-trading";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import { getMarketDataProvider } from "@/lib/market-data/provider";
import { z } from "zod";
import type { Quote } from "@/lib/market-data/types";

type Market = "US" | "TW";
type Division = "gpt" | "anthropic";

// Copy all type definitions, TradeDecisionSchema, TradingResponseSchema, helper
// functions (modelForDivision, isWithinTradingHours, ensureConfig, ensurePortfolio,
// loadCandidates, quoteWithTechnicals, hasSameDayConflict, executeTrade)
// from the existing trade-session/route.ts into this file.

export async function runTradeForUser(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  market: Market,
  opts: { bypassHoursCheck?: boolean } = {}
): Promise<string> {
  // Implementation mirrors the inner loop body of the existing POST handler
  // but scoped to a single market and single userId.
  //
  // Steps:
  // 1. ensureConfig(supabase, userId)
  // 2. for division in ["gpt", "anthropic"]:
  //    a. if !opts.bypassHoursCheck && !isWithinTradingHours(config, market) → skip
  //    b. ensurePortfolio(supabase, userId, division, market)
  //    c. Check if already traded today → skip if so
  //    d. loadCandidates → quoteWithTechnicals for candidates + open positions
  //    e. buildTradingDecisionPrompt → callModel → validateOrRepair
  //    f. executeTrade for each decision
  //    g. Insert agent_run record
  // 3. Return summary string like "gpt/US 完成，執行 2 筆交易。 anthropic/US 完成，執行 1 筆交易。"
}
```

### `src/lib/simulation/run-report.ts`

Extract the daily report logic from `src/app/api/simulation/end-of-day/route.ts`.

Export one function:

```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import { extractPredictions, saveExtractedPredictions } from "@/lib/analysis/pipeline/sim-predictions";
import { z } from "zod";

// Copy all type definitions, ReportSchema, helper functions
// (modelForDivision, portfolioValue, buildReportPrompt)
// from end-of-day/route.ts into this file.

export async function runReportForUser(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string
): Promise<string> {
  // Implementation mirrors the loop body of the existing POST handler.
  //
  // Steps for each division in ["gpt", "anthropic"]:
  // 1. Load portfolios, today's trades, open positions
  // 2. Build report prompt → callModel → validateOrRepair with ReportSchema
  // 3. Upsert into sim_daily_reports
  // 4. extractPredictions → saveExtractedPredictions
  // 5. Insert agent_run record
  //
  // Return summary string like "gpt 日報完成，anthropic 日報完成"
}
```

### `src/lib/simulation/run-weekly.ts`

Extract the weekly eval logic from `src/app/api/simulation/weekly-eval/route.ts`.

Export one function:

```typescript
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { computeWeeklyScore } from "@/lib/analysis/pipeline/sim-scoring";
import { verifyPredictions } from "@/lib/analysis/pipeline/sim-predictions";
import { getMarketDataProvider } from "@/lib/market-data/provider";

// Copy all type definitions and helper functions
// (weekBounds, valueForMarket, benchmarkReturn, buildWeeklyEvalPrompt, etc.)
// from weekly-eval/route.ts into this file.

export async function runWeeklyEvalForUser(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string
): Promise<string> {
  // Implementation mirrors the loop body of the existing POST handler.
  // Return summary string.
}
```

---

## Step 2 — Refactor existing routes to use shared lib

### `src/app/api/simulation/trade-session/route.ts`

Replace the entire file with a thin wrapper:

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runTradeForUser } from "@/lib/simulation/run-trade";

export const maxDuration = 120;

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入。" }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const messages: string[] = [];

  try {
    for (const market of ["US", "TW"] as const) {
      // bypassHoursCheck is false here — manual button respects trading hours
      const msg = await runTradeForUser(supabase, user.id, market, { bypassHoursCheck: false });
      messages.push(msg);
    }
    return NextResponse.json({ message: messages.join(" ") || "今日交易完成。" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "模擬交易失敗。" },
      { status: 500 }
    );
  }
}
```

### `src/app/api/simulation/end-of-day/route.ts`

Replace with:

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runReportForUser } from "@/lib/simulation/run-report";

export const maxDuration = 120;

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入。" }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  try {
    const message = await runReportForUser(supabase, user.id);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "產生日報失敗。" },
      { status: 500 }
    );
  }
}
```

### `src/app/api/simulation/weekly-eval/route.ts`

Replace with:

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runWeeklyEvalForUser } from "@/lib/simulation/run-weekly";

export const maxDuration = 120;

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入。" }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  try {
    const message = await runWeeklyEvalForUser(supabase, user.id);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "週評估失敗。" },
      { status: 500 }
    );
  }
}
```

---

## Step 3 — Create the cron endpoint

### `src/app/api/simulation/cron/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runTradeForUser } from "@/lib/simulation/run-trade";
import { runReportForUser } from "@/lib/simulation/run-report";
import { runWeeklyEvalForUser } from "@/lib/simulation/run-weekly";

export const maxDuration = 300;

type Action = "trade-us" | "trade-tw" | "report" | "weekly";

function validateSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  return header === secret;
}

export async function POST(request: NextRequest) {
  if (!validateSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") as Action | null;

  if (!action || !["trade-us", "trade-tw", "report", "weekly"].includes(action)) {
    return NextResponse.json(
      { error: "Missing or invalid ?action= param. Use: trade-us | trade-tw | report | weekly" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServiceClient();

  // Get all active user IDs from sim_config
  const { data: configs, error: configError } = await supabase
    .from("sim_config")
    .select("user_id")
    .eq("is_active", true);

  if (configError) {
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  const userIds = (configs ?? []).map((row: { user_id: string }) => row.user_id);

  if (!userIds.length) {
    return NextResponse.json({ message: "No active simulation users found." });
  }

  const results: string[] = [];

  for (const userId of userIds) {
    try {
      if (action === "trade-us") {
        const msg = await runTradeForUser(supabase, userId, "US", { bypassHoursCheck: true });
        results.push(msg);
      } else if (action === "trade-tw") {
        const msg = await runTradeForUser(supabase, userId, "TW", { bypassHoursCheck: true });
        results.push(msg);
      } else if (action === "report") {
        const msg = await runReportForUser(supabase, userId);
        results.push(msg);
      } else if (action === "weekly") {
        const msg = await runWeeklyEvalForUser(supabase, userId);
        results.push(msg);
      }
    } catch (err) {
      results.push(`User ${userId} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ message: results.join(" | ") });
}
```

---

## Step 4 — Environment variable

Add to `.env.local`:

```
CRON_SECRET=<generate a random 32-char alphanumeric string>
```

Also add to Vercel environment variables (same key, same value).

The value can be any long random string, e.g. `s1m_cr0n_s3cr3t_abc123xyz789`.

---

## TypeScript check

After all changes, run:

```bash
npx tsc --noEmit
```

Fix any type errors before finishing. The most common issue will be the `SupabaseClient` type for the `supabase` parameter — use `ReturnType<typeof createSupabaseServiceClient>` to match exactly.

---

## Schedule (set up separately after this prompt is applied)

Once the cron endpoint is deployed, four scheduled tasks will call it:

| Task | Cron (UTC) | Action | Notes |
|------|-----------|--------|-------|
| TW trade session | `30 1 * * 1-5` | `trade-tw` | 9:30am Taiwan time |
| US/CA trade session | `30 13 * * 1-5` | `trade-us` | 9:30am EDT |
| Daily report | `30 20 * * 1-5` | `report` | 4:30pm EDT, after US close |
| Weekly eval | `30 20 * * 5` | `weekly` | 4:30pm EDT Friday |

curl command format (for each scheduled task):

```bash
curl -s -X POST \
  "https://ai.rockhillinnovation.com/api/simulation/cron?action=trade-us" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```
