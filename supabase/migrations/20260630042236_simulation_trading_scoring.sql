create table if not exists public.sim_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  us_start_hour integer not null default 9,
  us_end_hour integer not null default 16,
  tw_start_hour integer not null default 9,
  tw_end_hour integer not null default 14,
  max_positions integer not null default 3,
  max_position_pct numeric not null default 0.40,
  stop_loss_threshold numeric not null default 0.15,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sim_portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  division text not null check (division in ('gpt', 'anthropic')),
  market text not null check (market in ('US', 'TW')),
  starting_cash numeric not null,
  current_cash numeric not null,
  created_at timestamptz not null default now(),
  reset_at timestamptz,
  unique (user_id, division, market)
);

create table if not exists public.sim_positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.sim_portfolios(id) on delete cascade,
  symbol text not null,
  market text not null check (market in ('US', 'TW')),
  name text not null,
  shares numeric not null,
  avg_cost_price numeric not null,
  current_price numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  stop_flagged boolean not null default false
);

create table if not exists public.sim_trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.sim_portfolios(id) on delete cascade,
  position_id uuid references public.sim_positions(id),
  action text not null check (action in ('buy', 'sell')),
  symbol text not null,
  market text not null check (market in ('US', 'TW')),
  name text not null,
  shares numeric not null,
  price_per_share numeric not null,
  total_amount numeric not null,
  thesis text not null,
  technical_basis text not null,
  fundamental_basis text,
  risk_factors text not null,
  target_price numeric,
  stop_loss numeric,
  conviction integer,
  outcome_pnl numeric,
  outcome_pct numeric,
  session_date date not null,
  executed_at timestamptz not null default now(),
  ai_model text
);

create table if not exists public.sim_daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  division text not null check (division in ('gpt', 'anthropic')),
  report_date date not null,
  us_portfolio_value numeric,
  tw_portfolio_value numeric,
  us_day_pnl numeric,
  tw_day_pnl numeric,
  us_day_pnl_pct numeric,
  tw_day_pnl_pct numeric,
  trades_summary text not null,
  positions_review text not null,
  market_commentary text not null,
  tomorrow_outlook text not null,
  planned_actions text,
  trades_today jsonb,
  positions_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, division, report_date)
);

create table if not exists public.sim_weekly_evals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  division text not null check (division in ('gpt', 'anthropic')),
  week_start date not null,
  week_end date not null,
  us_start_value numeric,
  us_end_value numeric,
  us_week_return_pct numeric,
  us_cumulative_return_pct numeric,
  us_benchmark_return_pct numeric,
  tw_start_value numeric,
  tw_end_value numeric,
  tw_week_return_pct numeric,
  tw_cumulative_return_pct numeric,
  tw_benchmark_return_pct numeric,
  trades_count integer,
  winning_trades integer,
  losing_trades integer,
  avg_conviction numeric,
  best_trade jsonb,
  worst_trade jsonb,
  strategy_review text,
  next_week_plan text,
  created_at timestamptz not null default now(),
  unique (user_id, division, week_end)
);

create table if not exists public.sim_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  division text not null check (division in ('gpt', 'anthropic')),
  score_date date not null,
  week_start date not null,
  week_end date not null,
  alpha_score numeric not null default 0,
  win_rate_score numeric not null default 0,
  risk_control_score numeric not null default 0,
  conviction_score numeric not null default 0,
  prediction_score numeric not null default 0,
  total_score numeric not null default 0,
  us_return_pct numeric,
  tw_return_pct numeric,
  us_benchmark_pct numeric,
  tw_benchmark_pct numeric,
  us_alpha_pct numeric,
  tw_alpha_pct numeric,
  win_rate_pct numeric,
  trades_evaluated integer,
  winning_trades integer,
  losing_trades integer,
  max_drawdown_pct numeric,
  peak_value numeric,
  trough_value numeric,
  avg_conviction_winners numeric,
  avg_conviction_losers numeric,
  conviction_correlation numeric,
  predictions_made integer,
  predictions_correct integer,
  prediction_accuracy_pct numeric,
  badges jsonb,
  cumulative_total numeric,
  cumulative_alpha numeric,
  cumulative_win_rate_pct numeric,
  created_at timestamptz not null default now(),
  unique (user_id, division, score_date)
);

create table if not exists public.sim_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  division text not null check (division in ('gpt', 'anthropic')),
  report_date date not null,
  verify_date date not null,
  condition_text text not null,
  condition_type text,
  symbol text,
  market text check (market in ('US', 'TW')),
  trigger_price numeric,
  trigger_direction text,
  predicted_action text,
  condition_met boolean,
  action_taken boolean,
  score_awarded boolean,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sim_config enable row level security;
alter table public.sim_portfolios enable row level security;
alter table public.sim_positions enable row level security;
alter table public.sim_trades enable row level security;
alter table public.sim_daily_reports enable row level security;
alter table public.sim_weekly_evals enable row level security;
alter table public.sim_scores enable row level security;
alter table public.sim_predictions enable row level security;

create policy "own sim_config" on public.sim_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sim_portfolios" on public.sim_portfolios
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sim_positions" on public.sim_positions
  for all using (portfolio_id in (select id from public.sim_portfolios where user_id = auth.uid()))
  with check (portfolio_id in (select id from public.sim_portfolios where user_id = auth.uid()));
create policy "own sim_trades" on public.sim_trades
  for all using (portfolio_id in (select id from public.sim_portfolios where user_id = auth.uid()))
  with check (portfolio_id in (select id from public.sim_portfolios where user_id = auth.uid()));
create policy "own sim_daily_reports" on public.sim_daily_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sim_weekly_evals" on public.sim_weekly_evals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sim_scores" on public.sim_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sim_predictions" on public.sim_predictions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_sim_trades_portfolio_session on public.sim_trades (portfolio_id, session_date);
create index if not exists idx_sim_positions_portfolio_status on public.sim_positions (portfolio_id, status);
create index if not exists idx_sim_daily_reports_user_division_date on public.sim_daily_reports (user_id, division, report_date desc);
create index if not exists idx_sim_scores_user_division_date on public.sim_scores (user_id, division, score_date desc);
create index if not exists idx_sim_predictions_user_division_report on public.sim_predictions (user_id, division, report_date);

grant select, insert, update, delete on public.sim_config to authenticated;
grant select, insert, update, delete on public.sim_portfolios to authenticated;
grant select, insert, update, delete on public.sim_positions to authenticated;
grant select, insert, update, delete on public.sim_trades to authenticated;
grant select, insert, update, delete on public.sim_daily_reports to authenticated;
grant select, insert, update, delete on public.sim_weekly_evals to authenticated;
grant select, insert, update, delete on public.sim_scores to authenticated;
grant select, insert, update, delete on public.sim_predictions to authenticated;

grant all on public.sim_config to service_role;
grant all on public.sim_portfolios to service_role;
grant all on public.sim_positions to service_role;
grant all on public.sim_trades to service_role;
grant all on public.sim_daily_reports to service_role;
grant all on public.sim_weekly_evals to service_role;
grant all on public.sim_scores to service_role;
grant all on public.sim_predictions to service_role;
