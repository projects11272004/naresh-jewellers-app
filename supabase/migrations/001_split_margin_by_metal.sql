-- Run this once in the Supabase SQL Editor on the already-live project
-- (ntqeasbmmbjgdulygium) to split the single local_margin_pct into separate
-- gold_margin_pct / silver_margin_pct columns, and set them from today's
-- calibration against HBR Gold's board (24K gold ~16.42% above raw GoldAPI
-- spot, silver ~26.49% above) so the daily auto-sync lands close to the real
-- local market rate instead of the raw international spot price.

alter table settings add column if not exists gold_margin_pct numeric(5,4) not null default 0;
alter table settings add column if not exists silver_margin_pct numeric(5,4) not null default 0;

update settings
set gold_margin_pct = 0.1642,
    silver_margin_pct = 0.2649
where id = 1;

alter table settings drop column if exists local_margin_pct;

-- Recalibrating later: compare a fresh GoldAPI-only sync (temporarily set both
-- margins to 0, run the function once, note the raw rates) against your current
-- local reference rate, then set gold_margin_pct / silver_margin_pct to
-- (local_rate / raw_rate) - 1 for each metal.
