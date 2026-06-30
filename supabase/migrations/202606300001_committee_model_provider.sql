alter table public.committee_decisions
  add column if not exists model_provider text not null default 'OpenAI';

comment on column public.committee_decisions.model_provider is
  'Which AI ran this committee pass: OpenAI (gpt-5.5) or Anthropic (claude-sonnet-4-6)';
