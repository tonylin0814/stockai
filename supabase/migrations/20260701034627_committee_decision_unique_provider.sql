-- Keep one committee decision per daily run, user, and model provider.
-- Older duplicated rows were created by repeated polling in the committee stage.

with ranked as (
  select
    id,
    row_number() over (
      partition by daily_run_id, user_id, model_provider
      order by created_at asc, id asc
    ) as rn
  from public.committee_decisions
  where daily_run_id is not null
)
delete from public.committee_decisions c
using ranked r
where c.id = r.id
  and r.rn > 1;

create unique index if not exists committee_decisions_daily_provider_unique
  on public.committee_decisions (daily_run_id, user_id, model_provider)
  where daily_run_id is not null;
