-- Schedules the sync-rates Edge Function to run daily at 09:00 Asia/Kolkata (03:30 UTC).
-- Run this once in the Supabase SQL Editor after deploying the function.
-- Requires the pg_cron and pg_net extensions (enable them under
-- Database > Extensions in the Supabase dashboard first, if not already on).

select
  cron.schedule(
    'daily-rate-sync',
    '30 3 * * *', -- 03:30 UTC = 09:00 IST
    $$
    select
      net.http_post(
        url := 'https://ntqeasbmmbjgdulygium.supabase.co/functions/v1/sync-rates',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
      );
    $$
  );

-- NOTE on the Authorization header above: storing the service_role key in a
-- Postgres setting (via `alter database postgres set app.settings.service_role_key = '...'`,
-- run once by you directly in the SQL editor, never committed here) keeps it
-- out of this repo. Alternatively, since this function only writes data the
-- service_role already owns, you can simplify by deploying the function with
-- `--no-verify-jwt` and calling it with the anon key instead — see the
-- Supabase docs on scheduling Edge Functions for the current recommended
-- approach, since this API has changed across Supabase versions.

-- To check past runs or remove the schedule later:
--   select * from cron.job;
--   select cron.unschedule('daily-rate-sync');
