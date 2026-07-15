-- Schedules the sync-rates Edge Function to run daily at 09:00 Asia/Kolkata (03:30 UTC).
-- Follows Supabase's current recommended pattern: https://supabase.com/docs/guides/functions/schedule-functions
-- Run this once in the Supabase SQL Editor, in this order, after deploying the function.
--
-- Requires the pg_cron and pg_net extensions — enable both under
-- Database > Extensions in the Supabase dashboard first, if not already on.

-- 1) Store the project URL and anon key in Supabase Vault (encrypted, not visible in
--    plain SQL after this point). Run this once — replace the anon key with your real
--    one from Settings > API if it's ever rotated.
select vault.create_secret('https://ntqeasbmmbjgdulygium.supabase.co', 'project_url');
select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50cWVhc2JtbWJqZ2R1bHlnaXVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwOTk0MTEsImV4cCI6MjA5OTY3NTQxMX0.RwlUGtXTVO0SS4nHNmRgy_zO2K4SzCilZbvRbltTgBA',
  'anon_key'
);

-- 2) Schedule the daily invocation. The anon key is enough here — it only proves the
-- request came from someone with legitimate access to this project; the function
-- itself uses the service_role key (injected automatically by Supabase, never stored
-- here) to actually read/write current_rates, rate_log, and settings.
select
  cron.schedule(
    'daily-rate-sync',
    '30 3 * * *', -- 03:30 UTC = 09:00 IST
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-rates',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
        )
      ) as request_id;
    $$
  );

-- To check past runs, remove the schedule, or test manually later:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select cron.unschedule('daily-rate-sync');
