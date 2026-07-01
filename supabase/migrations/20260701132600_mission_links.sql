create table if not exists public.mission_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  security_id uuid references public.securities(id) on delete cascade,
  portfolio_holding_id uuid references public.portfolio_holdings(id) on delete cascade,
  watchlist_item_id uuid references public.watchlist_items(id) on delete cascade,
  link_type text not null check (link_type in ('security', 'portfolio', 'watchlist')),
  created_at timestamptz not null default now(),
  constraint mission_links_target_check check (
    (
      link_type = 'security'
      and security_id is not null
      and portfolio_holding_id is null
      and watchlist_item_id is null
    )
    or (
      link_type = 'portfolio'
      and security_id is not null
      and portfolio_holding_id is not null
      and watchlist_item_id is null
    )
    or (
      link_type = 'watchlist'
      and security_id is not null
      and portfolio_holding_id is null
      and watchlist_item_id is not null
    )
  )
);

create unique index if not exists mission_links_unique_security
  on public.mission_links (mission_id, security_id)
  where link_type = 'security';

create unique index if not exists mission_links_unique_portfolio
  on public.mission_links (mission_id, portfolio_holding_id)
  where portfolio_holding_id is not null;

create unique index if not exists mission_links_unique_watchlist
  on public.mission_links (mission_id, watchlist_item_id)
  where watchlist_item_id is not null;

create index if not exists mission_links_user_id_idx on public.mission_links (user_id);
create index if not exists mission_links_mission_id_idx on public.mission_links (mission_id);
create index if not exists mission_links_security_id_idx on public.mission_links (security_id);
create index if not exists mission_links_portfolio_holding_id_idx on public.mission_links (portfolio_holding_id);
create index if not exists mission_links_watchlist_item_id_idx on public.mission_links (watchlist_item_id);

alter table public.mission_links enable row level security;

drop policy if exists "Users can view their own mission links" on public.mission_links;
create policy "Users can view their own mission links"
  on public.mission_links
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own mission links" on public.mission_links;
create policy "Users can insert their own mission links"
  on public.mission_links
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own mission links" on public.mission_links;
create policy "Users can update their own mission links"
  on public.mission_links
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own mission links" on public.mission_links;
create policy "Users can delete their own mission links"
  on public.mission_links
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
