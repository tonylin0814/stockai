create table if not exists public.daily_scan_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_run_id uuid references public.daily_runs(id) on delete set null,
  symbol text not null,
  market text not null default 'TW',
  name text not null,
  signal text not null check (signal in ('bull', 'bear', 'neutral')),
  current_price numeric,
  target_price numeric,
  stop_loss numeric,
  upside_pct numeric,
  time_horizon text check (time_horizon is null or time_horizon in ('short', 'swing', 'long')),
  confidence integer check (confidence is null or confidence between 0 and 100),
  reason text,
  key_risks jsonb not null default '[]'::jsonb,
  scan_summary text,
  added_to_watchlist boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.daily_scan_picks enable row level security;

create policy "Users can manage their own daily scan picks"
  on public.daily_scan_picks
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists idx_daily_scan_picks_user_created
  on public.daily_scan_picks(user_id, created_at desc);

create index if not exists idx_daily_scan_picks_daily_run
  on public.daily_scan_picks(daily_run_id, confidence desc);

grant select, insert, update, delete on public.daily_scan_picks to authenticated;
grant all on public.daily_scan_picks to service_role;
