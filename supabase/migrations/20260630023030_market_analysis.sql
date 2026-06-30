create table if not exists public.market_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_run_id uuid references public.daily_runs(id) on delete set null,
  market text not null check (market in ('TW', 'US')),
  sentiment text check (sentiment is null or sentiment in ('bull', 'bear', 'neutral')),
  sentiment_reason text,
  picks_under_50 jsonb not null default '[]'::jsonb,
  picks_under_100 jsonb not null default '[]'::jsonb,
  picks_under_200 jsonb not null default '[]'::jsonb,
  etf_picks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.market_analysis_runs enable row level security;

create policy "Users can manage their own market analysis"
  on public.market_analysis_runs
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists idx_market_analysis_runs_user_market_created
  on public.market_analysis_runs(user_id, market, created_at desc);

create index if not exists idx_market_analysis_runs_daily_run_market
  on public.market_analysis_runs(daily_run_id, market);

grant select, insert, update, delete on public.market_analysis_runs to authenticated;
grant all on public.market_analysis_runs to service_role;
