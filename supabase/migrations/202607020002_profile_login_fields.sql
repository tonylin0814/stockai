alter table if exists public.stocks_profiles
  add column if not exists nickname text,
  add column if not exists username text,
  add column if not exists login_email text;

update public.stocks_profiles
set nickname = coalesce(nickname, display_name)
where nickname is null;

create unique index if not exists stocks_profiles_username_unique
  on public.stocks_profiles (lower(username))
  where username is not null;

create or replace function public.resolve_login_email(login_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select login_email
  from public.stocks_profiles
  where lower(username) = lower(trim(login_username))
  limit 1
$$;

grant execute on function public.resolve_login_email(text) to anon;
grant execute on function public.resolve_login_email(text) to authenticated;
