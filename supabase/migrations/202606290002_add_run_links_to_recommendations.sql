alter table public.recommendations
  add column if not exists daily_run_id uuid references public.daily_runs(id) on delete cascade,
  add column if not exists mission_id uuid references public.missions(id) on delete cascade;

create index if not exists idx_recommendations_daily_run_id
  on public.recommendations(daily_run_id);

create index if not exists idx_recommendations_mission_id
  on public.recommendations(mission_id);
