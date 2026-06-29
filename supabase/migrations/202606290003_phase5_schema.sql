alter table public.agent_runs
  add column if not exists prompt_tokens integer,
  add column if not exists completion_tokens integer,
  add column if not exists estimated_cost_usd numeric;

alter table public.recommendations
  add column if not exists user_rating text
    check (user_rating in ('useful', 'not_useful', 'too_aggressive', 'too_conservative', 'too_early')),
  add column if not exists user_notes text,
  add column if not exists user_rated_at timestamptz;

create table if not exists public.alerts (
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

create index if not exists idx_alerts_user_date on public.alerts(user_id, alert_date desc);

create table if not exists public.paper_trades (
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

create index if not exists idx_paper_trades_user_id on public.paper_trades(user_id);

create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('finnhub', 'alpha_vantage', 'openai', 'anthropic', 'yahoo')),
  date date not null default current_date,
  request_count integer not null default 0,
  daily_limit integer,
  updated_at timestamptz not null default now(),
  unique (user_id, provider, date)
);

alter table public.alerts enable row level security;
alter table public.paper_trades enable row level security;
alter table public.api_rate_limits enable row level security;

drop policy if exists "Users manage their own alerts" on public.alerts;
create policy "Users manage their own alerts"
  on public.alerts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage their own paper trades" on public.paper_trades;
create policy "Users manage their own paper trades"
  on public.paper_trades for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage their own rate limits" on public.api_rate_limits;
create policy "Users manage their own rate limits"
  on public.api_rate_limits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.alerts to authenticated;
grant select, insert, update, delete on public.paper_trades to authenticated;
grant select, insert, update, delete on public.api_rate_limits to authenticated;
