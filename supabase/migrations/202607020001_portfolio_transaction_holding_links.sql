alter table if exists public.stocks_portfolio_transactions
  add column if not exists holding_id uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.stocks_portfolio_transactions') is not null
    and to_regclass('public.stocks_portfolio_holdings') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'stocks_portfolio_transactions_holding_id_fkey'
    )
  then
    alter table public.stocks_portfolio_transactions
      add constraint stocks_portfolio_transactions_holding_id_fkey
      foreign key (holding_id)
      references public.stocks_portfolio_holdings(id)
      on delete cascade;
  end if;
end $$;

create index if not exists stocks_portfolio_transactions_holding_id_idx
  on public.stocks_portfolio_transactions (holding_id);

create index if not exists stocks_portfolio_transactions_holding_date_idx
  on public.stocks_portfolio_transactions (holding_id, trade_date desc, created_at desc);

grant select, insert, update, delete on table public.stocks_portfolio_transactions to authenticated;
grant all on table public.stocks_portfolio_transactions to service_role;
