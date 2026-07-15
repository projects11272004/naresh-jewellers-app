-- Naresh Jewellers — Phase 1 (Rate Master) schema.
-- Run this in the Supabase SQL Editor for a fresh project. Contains no secrets —
-- safe to commit. Actual credentials live only in .env.local (gitignored).

create table rate_log (
  id bigint generated always as identity primary key,
  purity text not null check (purity in ('24K','22K','18K','14K','Silver')),
  rate_per_gram numeric(10,2) not null,
  updated_on timestamptz not null default now(),
  updated_by text,
  source text not null default 'Manual' check (source in ('Manual','Auto-Sync API'))
);

create table current_rates (
  purity text primary key check (purity in ('24K','22K','18K','14K','Silver')),
  rate_per_gram numeric(10,2) not null,
  updated_on timestamptz not null default now(),
  updated_by text,
  source text not null default 'Manual' check (source in ('Manual','Auto-Sync API'))
);

create table settings (
  id int primary key default 1 check (id = 1),
  -- Separate margins per metal: bridges GoldAPI's raw international spot price up to
  -- the local India retail rate (import duty + GST + dealer margin), which differs
  -- meaningfully between gold and silver. Calibrate by comparing a day's raw GoldAPI
  -- rate to your actual local reference rate (e.g. a bullion dealer's board), then
  -- leave it alone until the gap visibly drifts.
  gold_margin_pct numeric(5,4) not null default 0,
  silver_margin_pct numeric(5,4) not null default 0,
  alert_email text,
  last_sync_status text default 'Not yet run',
  last_sync_time timestamptz
);

insert into settings (id, gold_margin_pct, silver_margin_pct, alert_email)
values (1, 0.1642, 0.2649, 'owner@example.com');

insert into current_rates (purity, rate_per_gram, updated_by, source) values
('24K', 7850, 'owner@example.com', 'Manual'),
('22K', 7195, 'owner@example.com', 'Manual'),
('18K', 5888, 'owner@example.com', 'Manual'),
('14K', 4575, 'owner@example.com', 'Manual'),
('Silver', 98, 'owner@example.com', 'Manual');

alter table current_rates enable row level security;
alter table rate_log enable row level security;
alter table settings enable row level security;

-- Public (anon key) can read current + historical rates — needed for the
-- dashboard to load without requiring a logged-in session in Phase 1.
create policy "Public can view current rates" on current_rates for select using (true);
create policy "Public can view rate history" on rate_log for select using (true);

-- settings has no public policy on purpose — locked to service-role-only
-- access (used later by the Edge Function that runs the daily rate sync).
