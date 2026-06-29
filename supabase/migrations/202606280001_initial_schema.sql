-- Initial Supabase schema for the private Taiwan/US investment decision platform.
-- Review only. Do not run until approved by the supervisor.

create extension if not exists "pgcrypto";

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  display_name text,
  base_currency text not null default 'TWD',
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('family_admin', 'family_member')),
  can_view_family_portfolios boolean not null default false,
  can_manage_family_members boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  max_single_position_pct numeric not null default 15,
  max_sector_exposure_pct numeric not null default 35,
  max_market_exposure_pct numeric not null default 70,
  default_stop_loss_pct numeric not null default 10,
  min_consensus_level text not null default 'strong',
  min_confidence_for_action numeric not null default 70,
  daily_run_time text,
  notification_channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.securities (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  market text not null,
  name text not null,
  security_type text not null,
  currency text not null,
  exchange text,
  sector text,
  industry text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (symbol, market)
);

create table public.security_prices (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities(id) on delete cascade,
  price_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric not null,
  adjusted_close numeric,
  volume numeric,
  source text not null,
  data_quality_state text not null default 'missing' check (data_quality_state in ('fresh', 'delayed', 'stale', 'missing', 'conflicting')),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (security_id, price_date, source)
);

create table public.market_indices (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  market text not null,
  name text not null,
  currency text not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (symbol, market, source)
);

create table public.market_index_prices (
  id uuid primary key default gen_random_uuid(),
  index_id uuid not null references public.market_indices(id) on delete cascade,
  price_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric not null,
  change_pct numeric,
  source text not null,
  data_quality_state text not null default 'missing' check (data_quality_state in ('fresh', 'delayed', 'stale', 'missing', 'conflicting')),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (index_id, price_date, source)
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  quote_currency text not null,
  rate_date date not null,
  rate numeric not null,
  source text not null,
  data_quality_state text not null default 'missing' check (data_quality_state in ('fresh', 'delayed', 'stale', 'missing', 'conflicting')),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (base_currency, quote_currency, rate_date, source)
);

create table public.portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  security_id uuid not null references public.securities(id) on delete restrict,
  shares numeric not null check (shares >= 0),
  average_cost numeric not null check (average_cost >= 0),
  cost_currency text not null,
  strategy text,
  notes text,
  opened_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  security_id uuid not null references public.securities(id) on delete restrict,
  transaction_type text not null,
  trade_date date not null,
  shares numeric not null,
  price numeric not null,
  currency text not null,
  fees numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  security_id uuid not null references public.securities(id) on delete restrict,
  visibility text not null default 'private' check (visibility in ('private', 'family_shared')),
  reason text,
  target_buy_price numeric,
  alert_price numeric,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  manager_name text not null,
  model_provider text not null,
  model_name text not null,
  brain_description text,
  is_enabled boolean not null default true,
  participates_in_committee boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.division_teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  team_name text not null,
  team_leader text not null,
  team_role text,
  sort_order integer not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, team_name)
);

create table public.team_agents (
  id uuid primary key default gen_random_uuid(),
  division_team_id uuid not null references public.division_teams(id) on delete cascade,
  agent_name text not null,
  agent_role text not null,
  agent_type text not null,
  tool_groups text[],
  task_description text,
  sort_order integer not null,
  is_required boolean not null default true,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  run_date date not null,
  status text not null,
  data_package jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private', 'family_shared')),
  title text not null,
  mission_type text,
  original_question text not null,
  status text not null default 'pending',
  related_symbols text[],
  related_security_ids uuid[],
  data_package jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_run_id uuid references public.daily_runs(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  team_agent_id uuid references public.team_agents(id) on delete set null,
  status text not null,
  model_provider text,
  model_name text,
  prompt_key text,
  prompt_version text,
  input_summary text,
  tools_used jsonb,
  output jsonb,
  confidence numeric,
  token_count integer,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.team_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  daily_run_id uuid references public.daily_runs(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  division text not null,
  team_name text not null,
  team_leader text not null,
  model_provider text not null,
  model_name text not null,
  report_type text not null,
  market_view jsonb,
  portfolio_review jsonb,
  mission_analysis jsonb,
  market_scan_recommendations jsonb,
  final_team_view jsonb,
  confidence numeric,
  created_at timestamptz not null default now()
);

create table public.division_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  daily_run_id uuid references public.daily_runs(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  division text not null,
  division_manager text not null,
  model_provider text not null,
  model_name text,
  decision_action text not null,
  confidence numeric,
  market_summary text,
  portfolio_actions jsonb,
  mission_decision jsonb,
  top_recommendations jsonb,
  supporting_teams text[],
  opposing_teams text[],
  internal_disagreements jsonb,
  created_at timestamptz not null default now()
);

create table public.committee_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  daily_run_id uuid references public.daily_runs(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  final_action text not null,
  action_type text,
  consensus_level text not null,
  confidence numeric,
  weighted_confidence numeric,
  decision_summary text,
  agreement_summary text,
  disagreement_summary text,
  final_recommendations jsonb,
  division_inputs jsonb,
  is_action_allowed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  source_type text not null check (source_type in ('team', 'division', 'committee')),
  team_report_id uuid references public.team_reports(id) on delete cascade,
  division_decision_id uuid references public.division_decisions(id) on delete cascade,
  committee_decision_id uuid references public.committee_decisions(id) on delete cascade,
  source_name text not null,
  division text,
  team_name text,
  security_id uuid not null references public.securities(id) on delete restrict,
  recommendation_date date not null,
  action text not null,
  buy_zone_low numeric,
  buy_zone_high numeric,
  target_price numeric,
  stop_loss numeric,
  position_size_pct numeric,
  time_horizon text,
  confidence numeric not null,
  reason text not null,
  key_risks jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  check (num_nonnulls(team_report_id, division_decision_id, committee_decision_id) = 1)
);

create table public.recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  evaluation_date date not null,
  horizon_days integer not null,
  start_price numeric,
  end_price numeric,
  return_pct numeric,
  max_drawdown_pct numeric,
  hit_target boolean,
  hit_stop_loss boolean,
  direction_correct boolean,
  missed_opportunity boolean,
  score_delta numeric,
  notes text,
  created_at timestamptz not null default now(),
  unique (recommendation_id, horizon_days)
);

create table public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  snapshot_date date not null,
  entity_type text not null,
  entity_name text not null,
  division text,
  accuracy_7d numeric,
  accuracy_30d numeric,
  accuracy_90d numeric,
  average_return_pct numeric,
  average_drawdown_pct numeric,
  win_rate numeric,
  recommendation_count integer,
  best_call jsonb,
  worst_call jsonb,
  created_at timestamptz not null default now()
);

create table public.influence_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  entity_type text not null,
  entity_name text not null,
  division text,
  score_date date not null,
  accuracy_score numeric not null default 50,
  return_score numeric not null default 50,
  risk_control_score numeric not null default 50,
  confidence_calibration_score numeric not null default 50,
  influence_points numeric not null default 50,
  decision_weight numeric,
  change_reason text,
  created_at timestamptz not null default now()
);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null,
  base_url text,
  market text,
  is_free boolean not null default true,
  rate_limit_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.data_fetch_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete set null,
  fetch_type text not null,
  status text not null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  rows_inserted integer,
  created_at timestamptz not null default now()
);

create index idx_family_memberships_user_id on public.family_memberships(user_id);
create index idx_portfolio_holdings_user_id on public.portfolio_holdings(user_id);
create index idx_portfolio_holdings_security_id on public.portfolio_holdings(security_id);
create index idx_watchlist_items_user_id on public.watchlist_items(user_id);
create index idx_daily_runs_user_id on public.daily_runs(user_id);
create index idx_missions_user_id on public.missions(user_id);
create index idx_team_reports_user_id on public.team_reports(user_id);
create index idx_division_decisions_user_id on public.division_decisions(user_id);
create index idx_committee_decisions_user_id on public.committee_decisions(user_id);
create index idx_recommendations_user_id on public.recommendations(user_id);
create index idx_recommendations_security_id on public.recommendations(security_id);
create index idx_recommendation_outcomes_recommendation_id on public.recommendation_outcomes(recommendation_id);
create index idx_security_prices_security_date on public.security_prices(security_id, price_date desc);
create index idx_market_index_prices_index_date on public.market_index_prices(index_id, price_date desc);

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.family_memberships enable row level security;
alter table public.user_settings enable row level security;
alter table public.portfolio_holdings enable row level security;
alter table public.portfolio_transactions enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.daily_runs enable row level security;
alter table public.missions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.team_reports enable row level security;
alter table public.division_decisions enable row level security;
alter table public.committee_decisions enable row level security;
alter table public.recommendations enable row level security;
alter table public.recommendation_outcomes enable row level security;
alter table public.performance_snapshots enable row level security;
alter table public.influence_scores enable row level security;

create policy "Users can manage families they created"
  on public.families
  for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Users can manage their own profile"
  on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can manage their own family memberships"
  on public.family_memberships
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own settings"
  on public.user_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own portfolio holdings"
  on public.portfolio_holdings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own portfolio transactions"
  on public.portfolio_transactions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own watchlist items"
  on public.watchlist_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own daily runs"
  on public.daily_runs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own missions"
  on public.missions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own agent runs"
  on public.agent_runs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own team reports"
  on public.team_reports
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own division decisions"
  on public.division_decisions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own committee decisions"
  on public.committee_decisions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own recommendations"
  on public.recommendations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage outcomes for their recommendations"
  on public.recommendation_outcomes
  for all
  using (
    exists (
      select 1
      from public.recommendations r
      where r.id = recommendation_outcomes.recommendation_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recommendations r
      where r.id = recommendation_outcomes.recommendation_id
        and r.user_id = auth.uid()
    )
  );

create policy "Users can manage their own performance snapshots"
  on public.performance_snapshots
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their own influence scores"
  on public.influence_scores
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

insert into public.divisions (
  name,
  manager_name,
  model_provider,
  model_name,
  brain_description,
  is_enabled,
  participates_in_committee,
  sort_order
) values
  ('GPT Division', 'Monica', 'OpenAI', 'gpt-5.5', 'GPT 5.5 reasoning brain', true, true, 1),
  ('Claude Division', 'Claire', 'Anthropic', 'claude-sonnet-4-6', 'Claude Sonnet reasoning brain', true, true, 2)
on conflict (name) do update set
  manager_name = excluded.manager_name,
  model_provider = excluded.model_provider,
  model_name = excluded.model_name,
  brain_description = excluded.brain_description,
  is_enabled = excluded.is_enabled,
  participates_in_committee = excluded.participates_in_committee,
  sort_order = excluded.sort_order,
  updated_at = now();

with seeded_teams(team_name, team_leader, team_role, sort_order) as (
  values
    ('基本面品質團隊', '林品妍 Sophia Lin', 'Fundamental quality analysis', 1),
    ('技術量價團隊', '陳昱翔 Marcus Chen', 'Technical price and volume analysis', 2),
    ('總經產業團隊', '王若庭 Vivian Wang', 'Macro and industry analysis', 3),
    ('事件催化團隊', '張以安 Ethan Chang', 'Event catalyst analysis', 4),
    ('風險控管團隊', '許承睿 Daniel Hsu', 'Risk control analysis', 5)
)
insert into public.division_teams (
  division_id,
  team_name,
  team_leader,
  team_role,
  sort_order,
  is_enabled
)
select
  d.id,
  st.team_name,
  st.team_leader,
  st.team_role,
  st.sort_order,
  true
from public.divisions d
cross join seeded_teams st
where d.name in ('GPT Division', 'Claude Division')
on conflict (division_id, team_name) do update set
  team_leader = excluded.team_leader,
  team_role = excluded.team_role,
  sort_order = excluded.sort_order,
  is_enabled = excluded.is_enabled,
  updated_at = now();
