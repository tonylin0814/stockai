alter table public.recommendations
  add column if not exists technical_highlights jsonb;
