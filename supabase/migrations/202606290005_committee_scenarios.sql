alter table public.committee_decisions
  add column if not exists final_scenarios jsonb;
