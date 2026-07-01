-- Prevent duplicate team reports within the same daily run.
-- The application-level runningTeamKey soft lock catches normal polling overlap.
-- This index is the database-level final guard against duplicate report rows.

CREATE UNIQUE INDEX IF NOT EXISTS team_reports_daily_run_team_unique
  ON public.team_reports (daily_run_id, division, team_name)
  WHERE daily_run_id IS NOT NULL;
