# Phase 5 — Polish & Reliability

Build all 8 Phase 5 tasks below in a single pass. Stop after Task 12 (nav update). Do not start any new phases. Run `npm run build` at the end and confirm it passes.

---

## Task 1 — DB Migration

Create `supabase/migrations/202606290003_phase5_schema.sql`:

```sql
-- 1. Add columns to agent_runs for granular cost tracking
alter table public.agent_runs
  add column if not exists prompt_tokens integer,
  add column if not exists completion_tokens integer,
  add column if not exists estimated_cost_usd numeric;

-- 2. Add user feedback columns to recommendations
alter table public.recommendations
  add column if not exists user_rating text
    check (user_rating in ('useful', 'not_useful', 'too_aggressive', 'too_conservative', 'too_early')),
  add column if not exists user_notes text,
  add column if not exists user_rated_at timestamptz;

-- 3. Alerts table
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete cascade,
  alert_type text not null check (alert_type in ('price_in_buy_zone', 'target_hit', 'stop_loss_hit', 'data_stale', 'api_failure')),
  symbol text,
  market text,
  message text not null,
  current_price numeric,
  threshold_price numeric,
  is_read boolean not null default false,
  alert_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index idx_alerts_user_date on public.alerts(user_id, alert_date desc);

-- 4. Paper trades table
create table public.paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  security_id uuid not null references public.securities(id) on delete restrict,
  direction text not null default 'long' check (direction in ('long', 'short')),
  entry_date date not null,
  entry_price numeric not null check (entry_price > 0),
  shares numeric not null default 1 check (shares > 0),
  target_price numeric,
  stop_loss numeric,
  exit_date date,
  exit_price numeric,
  return_pct numeric,
  status text not null default 'open' check (status in ('open', 'closed', 'target_hit', 'stop_hit')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_paper_trades_user_id on public.paper_trades(user_id);

-- 5. API rate limit tracking table
create table public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('finnhub', 'alpha_vantage', 'openai', 'anthropic', 'yahoo')),
  date date not null default current_date,
  request_count integer not null default 0,
  daily_limit integer,
  updated_at timestamptz not null default now(),
  unique (user_id, provider, date)
);

-- 6. RLS on new tables
alter table public.alerts enable row level security;
alter table public.paper_trades enable row level security;
alter table public.api_rate_limits enable row level security;

create policy "Users manage their own alerts"
  on public.alerts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users manage their own paper trades"
  on public.paper_trades for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users manage their own rate limits"
  on public.api_rate_limits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Apply this migration to Supabase before building any other task.

---

## Task 2 — Cost Tracking (update model.ts, db.ts, team.ts, division.ts, committee.ts)

### 2a. Update `src/lib/analysis/pipeline/model.ts`

Replace the entire file with this:

```ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { z } from "zod";

// Approximate cost per 1M tokens in USD.
// Update these constants when pricing changes.
const MODEL_COST_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 10, output: 40 },
  "gpt-5.5": { input: 10, output: 40 },
  "gpt-4o": { input: 5, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-latest": { input: 3, output: 15 },
};

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_COST_PER_1M[model] ?? { input: 5, output: 20 };
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}

export type ModelCallResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  // total for backward compat
  tokenCount: number;
};

export function inputSummary(prompt: string) {
  return prompt.replace(/\s+/g, " ").slice(0, 200);
}

export function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function parseJson(text: string): unknown {
  return JSON.parse(stripJsonFence(text));
}

export async function callModel(params: {
  provider: string;
  model: string;
  prompt: string;
}): Promise<ModelCallResult> {
  if (params.provider === "OpenAI") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [{ role: "user", content: params.prompt }],
      response_format: { type: "json_object" },
    });
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;
    return {
      text: response.choices[0]?.message?.content ?? "{}",
      promptTokens,
      completionTokens,
      estimatedCostUsd: estimateCostUsd(params.model, promptTokens, completionTokens),
      tokenCount: promptTokens + completionTokens,
    };
  }

  if (params.provider === "Anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: params.model,
      max_tokens: 16000,
      messages: [{ role: "user", content: params.prompt }],
    });
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const promptTokens = response.usage.input_tokens ?? 0;
    const completionTokens = response.usage.output_tokens ?? 0;
    return {
      text,
      promptTokens,
      completionTokens,
      estimatedCostUsd: estimateCostUsd(params.model, promptTokens, completionTokens),
      tokenCount: promptTokens + completionTokens,
    };
  }

  throw new Error(`Unsupported model provider: ${params.provider}`);
}

export async function validateOrRepair<T>(params: {
  rawText: string;
  schema: z.ZodType<T>;
  schemaDescription: string;
  provider: string;
  model: string;
}) {
  try {
    return {
      parsed: params.schema.parse(parseJson(params.rawText)),
      repaired: false,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      tokenCount: 0,
    };
  } catch {
    const repairPrompt = `The following text should be valid JSON matching this schema: ${params.schemaDescription}. Fix it and return only valid JSON: ${params.rawText}`;
    const repairResult = await callModel({
      provider: params.provider,
      model: params.model,
      prompt: repairPrompt,
    });
    return {
      parsed: params.schema.parse(parseJson(repairResult.text)),
      repaired: true,
      promptTokens: repairResult.promptTokens,
      completionTokens: repairResult.completionTokens,
      estimatedCostUsd: repairResult.estimatedCostUsd,
      tokenCount: repairResult.tokenCount,
    };
  }
}
```

### 2b. Update `src/lib/analysis/pipeline/db.ts`

Replace the entire file with this:

```ts
import { PROMPT_VERSIONS } from "@/lib/analysis/prompts/versions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function getFamilyId(userId: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("family_id")
    .eq("id", userId)
    .maybeSingle();

  return (data as { family_id?: string | null } | null)?.family_id ?? null;
}

export async function savePipelineAgentRun(params: {
  userId: string;
  dailyRunId?: string | null;
  missionId?: string;
  teamAgentId?: string | null;
  provider: string;
  model: string;
  promptKey: keyof typeof PROMPT_VERSIONS;
  inputSummary: string;
  output: unknown;
  confidence: number | null;
  tokenCount: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  startedAt: string;
  completedAt: string;
  status: "completed" | "failed";
  errorMessage?: string;
}) {
  const supabase = createSupabaseServiceClient();
  await supabase.from("agent_runs").insert({
    user_id: params.userId,
    daily_run_id: params.dailyRunId ?? null,
    mission_id: params.missionId ?? null,
    team_agent_id: params.teamAgentId ?? null,
    status: params.status,
    model_provider: params.provider,
    model_name: params.model,
    prompt_key: params.promptKey,
    prompt_version: PROMPT_VERSIONS[params.promptKey],
    input_summary: params.inputSummary,
    output: params.output,
    confidence: params.confidence,
    token_count: params.tokenCount,
    prompt_tokens: params.promptTokens ?? null,
    completion_tokens: params.completionTokens ?? null,
    estimated_cost_usd: params.estimatedCostUsd ?? null,
    started_at: params.startedAt,
    completed_at: params.completedAt,
    error_message: params.errorMessage ?? null,
  });
}
```

### 2c. Update `src/lib/analysis/pipeline/division.ts`

In `runDivisionPipeline`, update the two `savePipelineAgentRun` calls (success and failure) to include the new cost fields.

Success call (around line 137) — replace with:
```ts
await savePipelineAgentRun({
  userId: params.userId,
  dailyRunId: params.dailyRunId,
  missionId: params.missionId,
  provider: params.division.model_provider,
  model: params.division.model_name,
  promptKey: "divisionManager",
  inputSummary: inputSummary(prompt),
  output: decision,
  confidence: decision.confidence,
  tokenCount: modelResult.tokenCount + validation.tokenCount,
  promptTokens: modelResult.promptTokens + validation.promptTokens,
  completionTokens: modelResult.completionTokens + validation.completionTokens,
  estimatedCostUsd: modelResult.estimatedCostUsd + validation.estimatedCostUsd,
  startedAt,
  completedAt: new Date().toISOString(),
  status: "completed",
});
```

Failure call (around line 160) — add:
```ts
promptTokens: 0,
completionTokens: 0,
estimatedCostUsd: 0,
```

### 2d. Update `src/lib/analysis/pipeline/committee.ts`

Same change as 2c, applied to `runCommitteePipeline`'s two `savePipelineAgentRun` calls. Add `promptTokens`, `completionTokens`, `estimatedCostUsd` to both.

### 2e. Update `src/lib/analysis/pipeline/team.ts`

`team.ts` has its own local `callModel`, `validateOrRepair`, and `saveAgentRun`. Replace ALL three with updated versions that match the pattern above. Specifically:

**Local `ModelCallResult` type** — add `promptTokens`, `completionTokens`, `estimatedCostUsd`, keep `tokenCount`.

**Local `callModel`** — same logic as 2a: extract `prompt_tokens`/`completion_tokens` for OpenAI, `input_tokens`/`output_tokens` for Anthropic. Add the same `MODEL_COST_PER_1M` constant and `estimateCostUsd` function. Return all five fields.

**Local `validateOrRepair`** — same as 2a: return `promptTokens`, `completionTokens`, `estimatedCostUsd`, `tokenCount`.

**Local `saveAgentRun` params** — add `promptTokens?: number`, `completionTokens?: number`, `estimatedCostUsd?: number`. Save them to `agent_runs` columns `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`.

**All four `saveAgentRun` call sites in `runTeamPipeline`** — add the new fields:
- Success path for agent steps: `promptTokens: modelResult.promptTokens + validation.promptTokens, completionTokens: modelResult.completionTokens + validation.completionTokens, estimatedCostUsd: modelResult.estimatedCostUsd + validation.estimatedCostUsd`
- Failure path for agent steps: `promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0`
- Team leader success: `promptTokens: modelResult.promptTokens + validation.promptTokens, completionTokens: modelResult.completionTokens + validation.completionTokens, estimatedCostUsd: modelResult.estimatedCostUsd + validation.estimatedCostUsd`
- Team leader failure: `promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0`

---

## Task 3 — Error Boundaries

Create `src/app/error.tsx` (global error boundary, catches unhandled errors in all routes):

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-lg font-semibold text-slate-950">發生錯誤</h2>
      <p className="max-w-sm text-sm text-slate-600">{error.message || "請重新整理頁面或稍後再試。"}</p>
      <Button onClick={reset} variant="outline" size="sm">重試</Button>
    </div>
  );
}
```

Create the same component in these directories (each is a copy of the above, but scoped to that route segment):
- `src/app/analysis/daily/error.tsx`
- `src/app/analysis/cio/error.tsx`
- `src/app/missions/[id]/error.tsx`
- `src/app/performance/error.tsx`
- `src/app/performance/history/error.tsx`

---

## Task 4 — Alert System

### 4a. Create `src/lib/alerts/generate.ts`

```ts
import { getMarketDataProvider } from "@/lib/market-data/provider";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const BUY_ACTIONS = new Set(["buy", "small_buy", "add"]);
const SELL_ACTIONS = new Set(["sell", "reduce", "avoid"]);

type OpenRecommendation = {
  id: string;
  action: string;
  buy_zone_low: number | null;
  buy_zone_high: number | null;
  target_price: number | null;
  stop_loss: number | null;
  securities: { symbol: string; market: string; name: string } | null;
};

export type Alert = {
  id: string;
  alert_type: string;
  symbol: string | null;
  market: string | null;
  message: string;
  current_price: number | null;
  threshold_price: number | null;
  is_read: boolean;
  created_at: string;
};

export async function refreshAndGetAlerts(userId: string): Promise<Alert[]> {
  const supabase = createSupabaseServiceClient();
  const provider = getMarketDataProvider();
  const today = new Date().toISOString().slice(0, 10);

  // Load open recommendations
  const { data: recs } = await supabase
    .from("recommendations")
    .select("id, action, buy_zone_low, buy_zone_high, target_price, stop_loss, securities(symbol, market, name)")
    .eq("user_id", userId)
    .eq("status", "open");

  const openRecs = ((recs ?? []) as unknown as OpenRecommendation[]).filter(
    (r) => r.securities?.symbol
  );

  // Check which (recommendation_id, alert_type) pairs already alerted today
  const { data: existing } = await supabase
    .from("alerts")
    .select("recommendation_id, alert_type")
    .eq("user_id", userId)
    .eq("alert_date", today);

  const alreadyAlerted = new Set(
    ((existing ?? []) as Array<{ recommendation_id: string | null; alert_type: string }>)
      .filter((a) => a.recommendation_id)
      .map((a) => `${a.recommendation_id}:${a.alert_type}`)
  );

  // Fetch quotes and generate new alerts
  for (const rec of openRecs) {
    const { symbol, market } = rec.securities!;
    let currentPrice: number | null = null;

    try {
      const quote = await provider.getQuote(symbol, market as "US" | "TW");
      currentPrice = quote.price ?? null;
    } catch {
      continue;
    }

    if (currentPrice === null) continue;

    const action = rec.action.trim().toLowerCase();
    const newAlerts: Array<{
      alert_type: string;
      message: string;
      threshold_price: number | null;
    }> = [];

    // Buy zone alert
    if (
      rec.buy_zone_low !== null &&
      rec.buy_zone_high !== null &&
      currentPrice >= rec.buy_zone_low &&
      currentPrice <= rec.buy_zone_high
    ) {
      newAlerts.push({
        alert_type: "price_in_buy_zone",
        message: `${symbol} 現價 ${currentPrice} 已進入買入區間 ${rec.buy_zone_low}–${rec.buy_zone_high}`,
        threshold_price: rec.buy_zone_high,
      });
    }

    // Target hit
    if (rec.target_price !== null) {
      const targetHit =
        BUY_ACTIONS.has(action)
          ? currentPrice >= rec.target_price
          : SELL_ACTIONS.has(action)
          ? currentPrice <= rec.target_price
          : false;
      if (targetHit) {
        newAlerts.push({
          alert_type: "target_hit",
          message: `${symbol} 已達目標價 ${rec.target_price}（現價 ${currentPrice}）`,
          threshold_price: rec.target_price,
        });
      }
    }

    // Stop loss hit
    if (rec.stop_loss !== null) {
      const stopHit =
        BUY_ACTIONS.has(action)
          ? currentPrice <= rec.stop_loss
          : SELL_ACTIONS.has(action)
          ? currentPrice >= rec.stop_loss
          : false;
      if (stopHit) {
        newAlerts.push({
          alert_type: "stop_loss_hit",
          message: `${symbol} 已觸及停損價 ${rec.stop_loss}（現價 ${currentPrice}）`,
          threshold_price: rec.stop_loss,
        });
      }
    }

    // Insert only new alerts (not already sent today)
    for (const alert of newAlerts) {
      const key = `${rec.id}:${alert.alert_type}`;
      if (!alreadyAlerted.has(key)) {
        await supabase.from("alerts").insert({
          user_id: userId,
          recommendation_id: rec.id,
          alert_type: alert.alert_type,
          symbol,
          market,
          message: alert.message,
          current_price: currentPrice,
          threshold_price: alert.threshold_price,
          alert_date: today,
        });
        alreadyAlerted.add(key);
      }
    }
  }

  // Check for data staleness: no daily run completed in last 25 hours
  const { data: recentRun } = await supabase
    .from("daily_runs")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recentRun) {
    const staleKey = `null:data_stale`;
    if (!alreadyAlerted.has(staleKey)) {
      await supabase.from("alerts").insert({
        user_id: userId,
        alert_type: "data_stale",
        message: "尚未完成任何每日分析，建議先執行分析取得最新數據。",
        alert_date: today,
      });
    }
  } else {
    const completedAt = new Date(recentRun.completed_at as string);
    const ageHours = (Date.now() - completedAt.getTime()) / 3_600_000;
    if (ageHours > 25) {
      const staleKey = `null:data_stale`;
      if (!alreadyAlerted.has(staleKey)) {
        await supabase.from("alerts").insert({
          user_id: userId,
          alert_type: "data_stale",
          message: `上次分析已超過 ${Math.floor(ageHours)} 小時，建議重新執行分析。`,
          alert_date: today,
        });
      }
    }
  }

  // Return all unread alerts, newest first
  const { data: allAlerts } = await supabase
    .from("alerts")
    .select("id, alert_type, symbol, market, message, current_price, threshold_price, is_read, created_at")
    .eq("user_id", userId)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  return (allAlerts ?? []) as Alert[];
}
```

### 4b. Create `src/app/api/alerts/[id]/read/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const serviceClient = (await import("@/lib/supabase/service")).createSupabaseServiceClient();
  await serviceClient
    .from("alerts")
    .update({ is_read: true })
    .eq("id", params.id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
```

### 4c. Create `src/components/alerts-panel.tsx`

This is a **Server Component** that is called from the dashboard:

```tsx
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Clock } from "lucide-react";
import { refreshAndGetAlerts, type Alert } from "@/lib/alerts/generate";
import DismissAlertButton from "./dismiss-alert-button";

const ALERT_ICONS: Record<string, React.ReactNode> = {
  price_in_buy_zone: <TrendingUp className="h-4 w-4 text-green-600" />,
  target_hit: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  stop_loss_hit: <TrendingDown className="h-4 w-4 text-red-600" />,
  data_stale: <Clock className="h-4 w-4 text-amber-600" />,
  api_failure: <AlertTriangle className="h-4 w-4 text-amber-600" />,
};

const ALERT_BG: Record<string, string> = {
  price_in_buy_zone: "bg-green-50 border-green-200",
  target_hit: "bg-emerald-50 border-emerald-200",
  stop_loss_hit: "bg-red-50 border-red-200",
  data_stale: "bg-amber-50 border-amber-200",
  api_failure: "bg-amber-50 border-amber-200",
};

export default async function AlertsPanel({ userId }: { userId: string }) {
  let alerts: Alert[] = [];
  try {
    alerts = await refreshAndGetAlerts(userId);
  } catch {
    // Alerts are best-effort; don't break the dashboard
    return null;
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-slate-700">提醒 ({alerts.length})</h2>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start justify-between gap-3 rounded-md border p-3 ${ALERT_BG[alert.alert_type] ?? "bg-slate-50 border-slate-200"}`}
        >
          <div className="flex items-start gap-2">
            {ALERT_ICONS[alert.alert_type]}
            <p className="text-sm text-slate-800">{alert.message}</p>
          </div>
          <DismissAlertButton alertId={alert.id} />
        </div>
      ))}
    </div>
  );
}
```

### 4d. Create `src/components/dismiss-alert-button.tsx`

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function DismissAlertButton({ alertId }: { alertId: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function dismiss() {
    await fetch(`/api/alerts/${alertId}/read`, { method: "POST" });
    setDismissed(true);
  }

  return (
    <button onClick={dismiss} className="shrink-0 text-slate-400 hover:text-slate-600">
      <X className="h-4 w-4" />
    </button>
  );
}
```

### 4e. Update `src/app/dashboard/page.tsx`

Add the `AlertsPanel` between the greeting and the nav cards. The page now loads alerts server-side (best-effort). Import and use `Suspense` to avoid blocking if alerts are slow:

```tsx
import { Suspense } from "react";
import { BriefcaseBusiness, Eye } from "lucide-react";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AlertsPanel from "@/components/alerts-panel";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const displayName = user?.email ?? "使用者";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">總覽</h1>
        <p className="mt-1 text-sm text-slate-600">歡迎，{displayName}</p>
      </div>

      {user && (
        <Suspense fallback={null}>
          <AlertsPanel userId={user.id} />
        </Suspense>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/portfolio" className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
          <BriefcaseBusiness className="mb-3 h-5 w-5 text-slate-700" />
          <h2 className="font-semibold text-slate-950">投資組合</h2>
          <p className="mt-1 text-sm text-slate-600">新增、編輯與管理持股。</p>
        </Link>
        <Link href="/watchlist" className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
          <Eye className="mb-3 h-5 w-5 text-slate-700" />
          <h2 className="font-semibold text-slate-950">關注清單</h2>
          <p className="mt-1 text-sm text-slate-600">追蹤候選股票與 ETF。</p>
        </Link>
      </div>
    </div>
  );
}
```

---

## Task 5 — Paper Trading

### 5a. Add server actions to `src/app/actions.ts`

Add these four actions to the existing `actions.ts` file (do not remove any existing actions):

```ts
// ─── Paper Trades ────────────────────────────────────────────────────────────

const CreatePaperTradeSchema = z.object({
  recommendationId: z.string().uuid().optional(),
  symbol: z.string().min(1),
  market: z.enum(["US", "TW"]),
  direction: z.enum(["long", "short"]).default("long"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entryPrice: z.coerce.number().positive(),
  shares: z.coerce.number().positive().default(1),
  targetPrice: z.coerce.number().positive().optional(),
  stopLoss: z.coerce.number().positive().optional(),
  notes: z.string().max(500).optional(),
});

export async function createPaperTrade(_prev: unknown, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const parsed = CreatePaperTradeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const d = parsed.data;

  // upsert the security first
  const { data: sec } = await supabase
    .from("securities")
    .upsert({ symbol: d.symbol, market: d.market, name: d.symbol }, { onConflict: "symbol,market" })
    .select("id")
    .single();

  if (!sec) return { error: "找不到標的" };

  const { error } = await supabase.from("paper_trades").insert({
    user_id: user.id,
    recommendation_id: d.recommendationId ?? null,
    security_id: sec.id,
    direction: d.direction,
    entry_date: d.entryDate,
    entry_price: d.entryPrice,
    shares: d.shares,
    target_price: d.targetPrice ?? null,
    stop_loss: d.stopLoss ?? null,
    notes: d.notes ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath("/paper-trades");
  return { success: true };
}

const ClosePaperTradeSchema = z.object({
  id: z.string().uuid(),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exitPrice: z.coerce.number().positive(),
  status: z.enum(["closed", "target_hit", "stop_hit"]),
});

export async function closePaperTrade(_prev: unknown, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const parsed = ClosePaperTradeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const d = parsed.data;

  // Fetch trade to compute return_pct
  const { data: trade } = await supabase
    .from("paper_trades")
    .select("entry_price, direction")
    .eq("id", d.id)
    .eq("user_id", user.id)
    .single();

  if (!trade) return { error: "找不到模擬交易" };

  const t = trade as { entry_price: number; direction: string };
  const returnPct =
    t.direction === "long"
      ? ((d.exitPrice - t.entry_price) / t.entry_price) * 100
      : ((t.entry_price - d.exitPrice) / t.entry_price) * 100;

  const { error } = await supabase
    .from("paper_trades")
    .update({
      exit_date: d.exitDate,
      exit_price: d.exitPrice,
      return_pct: returnPct,
      status: d.status,
    })
    .eq("id", d.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/paper-trades");
  return { success: true };
}

// ─── Recommendation Feedback ─────────────────────────────────────────────────

const RateRecommendationSchema = z.object({
  id: z.string().uuid(),
  rating: z.enum(["useful", "not_useful", "too_aggressive", "too_conservative", "too_early"]),
  notes: z.string().max(500).optional(),
});

export async function rateRecommendation(_prev: unknown, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const parsed = RateRecommendationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const d = parsed.data;
  const { error } = await supabase
    .from("recommendations")
    .update({
      user_rating: d.rating,
      user_notes: d.notes ?? null,
      user_rated_at: new Date().toISOString(),
    })
    .eq("id", d.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/performance/history");
  return { success: true };
}

// ─── User Settings ────────────────────────────────────────────────────────────

const UpdateUserSettingsSchema = z.object({
  max_single_position_pct: z.coerce.number().min(1).max(100),
  max_sector_exposure_pct: z.coerce.number().min(1).max(100),
  max_market_exposure_pct: z.coerce.number().min(1).max(100),
  default_stop_loss_pct: z.coerce.number().min(1).max(50),
  min_consensus_level: z.enum(["strong", "weak"]),
  min_confidence_for_action: z.coerce.number().min(50).max(100),
});

export async function updateUserSettings(_prev: unknown, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const parsed = UpdateUserSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("user_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: true };
}
```

Make sure `revalidatePath` is imported at the top of `actions.ts` if it isn't already (from `"next/cache"`).

### 5b. Create `src/app/paper-trades/page.tsx`

Server component that lists all paper trades. Includes a "新增模擬交易" button that links to `/paper-trades/new`, and a table with columns: 標的、方向、進場日、進場價、股數、目標、停損、出場、報酬、狀態.

For open trades, show a "平倉" button that links to `/paper-trades/[id]/close`.

Full page structure:

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

type PaperTrade = {
  id: string;
  direction: string;
  entry_date: string;
  entry_price: number;
  shares: number;
  target_price: number | null;
  stop_loss: number | null;
  exit_date: string | null;
  exit_price: number | null;
  return_pct: number | null;
  status: string;
  securities: { symbol: string; market: string } | null;
};

export default async function PaperTradesPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("paper_trades")
    .select("id, direction, entry_date, entry_price, shares, target_price, stop_loss, exit_date, exit_price, return_pct, status, securities(symbol, market)")
    .eq("user_id", user.id)
    .order("entry_date", { ascending: false });

  const trades = (data ?? []) as unknown as PaperTrade[];
  const open = trades.filter((t) => t.status === "open");
  const closed = trades.filter((t) => t.status !== "open");

  const statusLabel: Record<string, string> = {
    open: "持有中",
    closed: "已平倉",
    target_hit: "達目標",
    stop_hit: "停損",
  };

  function TradeRow({ t }: { t: PaperTrade }) {
    return (
      <tr className="border-b border-slate-100">
        <td className="py-2 pr-4 font-medium">{t.securities?.symbol ?? "—"}</td>
        <td className="py-2 pr-4 text-sm text-slate-600">{t.direction === "long" ? "做多" : "做空"}</td>
        <td className="py-2 pr-4 text-sm text-slate-600">{t.entry_date}</td>
        <td className="py-2 pr-4 text-sm">{t.entry_price}</td>
        <td className="py-2 pr-4 text-sm">{t.shares}</td>
        <td className="py-2 pr-4 text-sm">{t.target_price ?? "—"}</td>
        <td className="py-2 pr-4 text-sm">{t.stop_loss ?? "—"}</td>
        <td className="py-2 pr-4 text-sm">{t.exit_price ?? "—"}</td>
        <td className={`py-2 pr-4 text-sm font-medium ${t.return_pct !== null ? (t.return_pct >= 0 ? "text-emerald-600" : "text-red-600") : ""}`}>
          {t.return_pct !== null ? `${t.return_pct.toFixed(2)}%` : "—"}
        </td>
        <td className="py-2 pr-4 text-sm">{statusLabel[t.status] ?? t.status}</td>
        {t.status === "open" && (
          <td className="py-2">
            <Link href={`/paper-trades/${t.id}/close`}>
              <Button variant="outline" size="sm">平倉</Button>
            </Link>
          </td>
        )}
      </tr>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-950">模擬交易</h1>
        <Link href="/paper-trades/new">
          <Button size="sm"><Plus className="mr-1 h-4 w-4" />新增</Button>
        </Link>
      </div>

      {open.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-700">持有中</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">標的</th>
                  <th className="pb-2 pr-4">方向</th>
                  <th className="pb-2 pr-4">進場日</th>
                  <th className="pb-2 pr-4">進場價</th>
                  <th className="pb-2 pr-4">股數</th>
                  <th className="pb-2 pr-4">目標</th>
                  <th className="pb-2 pr-4">停損</th>
                  <th className="pb-2 pr-4">出場</th>
                  <th className="pb-2 pr-4">報酬</th>
                  <th className="pb-2 pr-4">狀態</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>{open.map((t) => <TradeRow key={t.id} t={t} />)}</tbody>
            </table>
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-700">已結束</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">標的</th>
                  <th className="pb-2 pr-4">方向</th>
                  <th className="pb-2 pr-4">進場日</th>
                  <th className="pb-2 pr-4">進場價</th>
                  <th className="pb-2 pr-4">股數</th>
                  <th className="pb-2 pr-4">目標</th>
                  <th className="pb-2 pr-4">停損</th>
                  <th className="pb-2 pr-4">出場</th>
                  <th className="pb-2 pr-4">報酬</th>
                  <th className="pb-2 pr-4">狀態</th>
                </tr>
              </thead>
              <tbody>{closed.map((t) => <TradeRow key={t.id} t={t} />)}</tbody>
            </table>
          </div>
        </section>
      )}

      {trades.length === 0 && (
        <p className="text-sm text-slate-500">尚無模擬交易記錄。</p>
      )}
    </div>
  );
}
```

### 5c. Create `src/app/paper-trades/new/page.tsx`

A client form to create a new paper trade. Fields: symbol (text), market (US/TW select), direction (long/short select), entryDate (date input), entryPrice (number), shares (number), targetPrice (number, optional), stopLoss (number, optional), notes (textarea, optional). Submit calls the `createPaperTrade` server action via `useFormState`. On success, redirect to `/paper-trades`.

### 5d. Create `src/app/paper-trades/[id]/close/page.tsx`

A client form to close a paper trade. Pre-fill today's date in exitDate. Fields: exitDate (date), exitPrice (number), status (select: closed/target_hit/stop_hit). Submit calls `closePaperTrade`. On success redirect to `/paper-trades`.

---

## Task 6 — Recommendation Feedback

### 6a. Create `src/components/recommendation-rating.tsx`

```tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { rateRecommendation } from "@/app/actions";

const RATINGS = [
  { value: "useful", label: "有用" },
  { value: "not_useful", label: "沒用" },
  { value: "too_aggressive", label: "太積極" },
  { value: "too_conservative", label: "太保守" },
  { value: "too_early", label: "太早" },
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? "儲存中…" : "送出"}
    </button>
  );
}

export default function RecommendationRating({
  recommendationId,
  currentRating,
}: {
  recommendationId: string;
  currentRating: string | null;
}) {
  const [state, action] = useFormState(rateRecommendation, null);

  if (state?.success) {
    return <p className="text-xs text-emerald-600">已送出回饋，謝謝！</p>;
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={recommendationId} />
      <span className="text-xs text-slate-500">評價：</span>
      {RATINGS.map((r) => (
        <label key={r.value} className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name="rating"
            value={r.value}
            defaultChecked={r.value === currentRating}
            className="h-3 w-3"
          />
          <span className="text-xs">{r.label}</span>
        </label>
      ))}
      <SubmitButton />
    </form>
  );
}
```

### 6b. Update `src/app/performance/history/page.tsx`

In the recommendation table rows, add a `RecommendationRating` component below the reason text. Pass `recommendationId={rec.id}` and `currentRating={rec.user_rating ?? null}`. Make sure the page query includes `user_rating` in the select.

---

## Task 7 — Settings Page

### 7a. Create `src/app/settings/page.tsx`

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SettingsForm from "./settings-form";

export default async function SettingsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-2xl font-semibold text-slate-950">設定</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
```

### 7b. Create `src/app/settings/settings-form.tsx`

Client form component. Uses `useFormState` with `updateUserSettings` action. Fields:
- 最大單一部位 (%) — `max_single_position_pct`, default 15, range 1–100
- 最大板塊曝險 (%) — `max_sector_exposure_pct`, default 35, range 1–100
- 最大市場曝險 (%) — `max_market_exposure_pct`, default 70, range 1–100
- 預設停損 (%) — `default_stop_loss_pct`, default 10, range 1–50
- 最低共識級別 — `min_consensus_level`, select: strong（強共識）/ weak（弱共識）
- 最低信心度 — `min_confidence_for_action`, default 70, range 50–100

Each field is a labeled number input (or select). Show current values from `settings` prop. Show success/error state after submit.

---

## Task 8 — Reports Page

### 8a. Create `src/app/reports/page.tsx`

```tsx
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DailyRunSummary = {
  id: string;
  run_date: string;
  status: string;
  created_at: string;
  committee_decisions: Array<{
    final_action: string;
    consensus_level: string;
    confidence: number | null;
    is_action_allowed: boolean;
  }>;
};

const statusLabel: Record<string, string> = {
  completed: "完成",
  running: "執行中",
  failed: "失敗",
};

export default async function ReportsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("daily_runs")
    .select("id, run_date, status, created_at, committee_decisions(final_action, consensus_level, confidence, is_action_allowed)")
    .eq("user_id", user.id)
    .order("run_date", { ascending: false })
    .limit(90);

  const runs = (data ?? []) as unknown as DailyRunSummary[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-950">歷史報告</h1>

      {runs.length === 0 && <p className="text-sm text-slate-500">尚無報告記錄。</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="pb-2 pr-6">日期</th>
              <th className="pb-2 pr-6">狀態</th>
              <th className="pb-2 pr-6">委員會決議</th>
              <th className="pb-2 pr-6">共識</th>
              <th className="pb-2 pr-6">信心度</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const cd = run.committee_decisions?.[0];
              return (
                <tr key={run.id} className="border-b border-slate-100">
                  <td className="py-2 pr-6 font-medium">{run.run_date}</td>
                  <td className="py-2 pr-6 text-slate-600">{statusLabel[run.status] ?? run.status}</td>
                  <td className="py-2 pr-6">{cd?.final_action ?? "—"}</td>
                  <td className="py-2 pr-6">{cd?.consensus_level ?? "—"}</td>
                  <td className="py-2 pr-6">{cd?.confidence != null ? `${cd.confidence}%` : "—"}</td>
                  <td className="py-2">
                    {run.status === "completed" && (
                      <Link
                        href={`/reports/${run.id}`}
                        className="text-xs text-slate-500 hover:text-slate-900 underline"
                      >
                        查看
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 8b. Create `src/app/reports/[id]/page.tsx`

Show the full committee decision and division decisions for a specific daily run. Query:
- `daily_runs` — get `run_date` and `status`
- `committee_decisions` — filtered by `daily_run_id`
- `division_decisions` — filtered by `daily_run_id`

Display the committee decision (same card layout as in `/analysis/daily`), followed by two division cards side by side. Include a "← 歷史報告" back link at top.

---

## Task 9 — Cost Summary Widget on Dashboard

### 9a. Create `src/components/cost-summary.tsx`

Server component. Queries today's `agent_runs` for the current user, sums `estimated_cost_usd`. Displays only if cost > 0.

```tsx
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export default async function CostSummary({ userId }: { userId: string }) {
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("agent_runs")
    .select("estimated_cost_usd, token_count")
    .eq("user_id", userId)
    .gte("created_at", `${today}T00:00:00.000Z`);

  const rows = (data ?? []) as Array<{ estimated_cost_usd: number | null; token_count: number | null }>;
  const totalCost = rows.reduce((sum, r) => sum + (Number(r.estimated_cost_usd) || 0), 0);
  const totalTokens = rows.reduce((sum, r) => sum + (Number(r.token_count) || 0), 0);

  if (totalCost === 0) return null;

  return (
    <p className="text-xs text-slate-400">
      今日 API 費用估計：US${totalCost.toFixed(4)}（{totalTokens.toLocaleString()} tokens）
    </p>
  );
}
```

### 9b. Add `CostSummary` to dashboard footer

In `src/app/dashboard/page.tsx`, after the nav card grid, add:

```tsx
<Suspense fallback={null}>
  <CostSummary userId={user.id} />
</Suspense>
```

---

## Task 10 — Mobile Responsive Pass

Audit every page listed below. For each, ensure:
1. All `<table>` elements are wrapped in `<div className="overflow-x-auto">` if not already.
2. All `grid` layouts use `grid-cols-1 md:grid-cols-2` (or similar) so they stack on mobile.
3. Long text (team reports, analysis text) uses `break-words` or `min-w-0`.
4. No fixed-width `w-[600px]` or similar that would overflow on mobile — use `w-full max-w-...` instead.

Pages to audit:
- `src/app/portfolio/page.tsx`
- `src/app/watchlist/page.tsx`
- `src/app/markets/page.tsx`
- `src/app/analysis/daily/page.tsx`
- `src/app/missions/[id]/page.tsx`
- `src/app/performance/history/page.tsx`
- `src/app/performance/teams/page.tsx`
- `src/app/performance/divisions/page.tsx`
- `src/app/paper-trades/page.tsx` (new, already built with `overflow-x-auto`)

---

## Task 11 — Playwright Setup (Minimal)

Install Playwright:
```
npm install --save-dev @playwright/test
npx playwright install chromium
```

Create `playwright.config.ts` at the project root:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 14"] } },
  ],
});
```

Create `tests/auth.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /登入/i })).toBeVisible();
});

test("unauthenticated redirect", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
```

Create `tests/responsive.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("login page fits mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
```

Add to `package.json` scripts:
```json
"test:e2e": "playwright test"
```

Do NOT run the e2e tests as part of the build — they require a running dev server. Only run `npm run build` to verify the TypeScript build passes.

---

## Task 12 — Navigation Updates

Update `src/app/layout.tsx` nav to add links for the new pages:

After the 任務 nav link and before the logout button, add:

```tsx
<Link href="/paper-trades" className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
  模擬交易
</Link>
<Link href="/reports" className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
  報告
</Link>
<Link href="/settings" className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
  設定
</Link>
```

---

## Verification

After completing all tasks above:

1. Run `npm run build` — it must pass with zero TypeScript errors.
2. Confirm the following files were created:
   - `supabase/migrations/202606290003_phase5_schema.sql`
   - `src/lib/alerts/generate.ts`
   - `src/components/alerts-panel.tsx`
   - `src/components/dismiss-alert-button.tsx`
   - `src/components/cost-summary.tsx`
   - `src/components/recommendation-rating.tsx`
   - `src/app/error.tsx`
   - `src/app/analysis/daily/error.tsx`
   - `src/app/missions/[id]/error.tsx`
   - `src/app/performance/error.tsx`
   - `src/app/paper-trades/page.tsx`
   - `src/app/paper-trades/new/page.tsx`
   - `src/app/paper-trades/[id]/close/page.tsx`
   - `src/app/settings/page.tsx`
   - `src/app/settings/settings-form.tsx`
   - `src/app/reports/page.tsx`
   - `src/app/reports/[id]/page.tsx`
   - `src/app/api/alerts/[id]/read/route.ts`
   - `playwright.config.ts`
   - `tests/auth.spec.ts`
   - `tests/responsive.spec.ts`
3. Confirm these files were modified:
   - `src/lib/analysis/pipeline/model.ts`
   - `src/lib/analysis/pipeline/db.ts`
   - `src/lib/analysis/pipeline/team.ts`
   - `src/lib/analysis/pipeline/division.ts`
   - `src/lib/analysis/pipeline/committee.ts`
   - `src/app/actions.ts`
   - `src/app/dashboard/page.tsx`
   - `src/app/layout.tsx`
   - `src/app/performance/history/page.tsx`

Do not start any work beyond Phase 5. Stop here.
