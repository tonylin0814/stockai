alter table public.missions
  add column if not exists error_message text;
