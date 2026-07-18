-- 008: Customer profiles. Run after migration 007.
--
-- total_lifetime_purchase / outstanding_balance / last_purchase_at start at
-- 0/null and are meant to be kept up to date by the Billing pages built in
-- Stage 2 (each finalized invoice updates them) — they are NOT computed on
-- the fly here, since a stored running total is far cheaper to read at the
-- counter than summing every invoice on every page load.
--
-- Segmentation (VIP / Regular / New / Inactive / High-Value) is intentionally
-- NOT a stored column. It's computed in the app from
-- total_lifetime_purchase / last_purchase_at using rules that are still
-- placeholders pending the buyer's actual thresholds (see
-- src/lib/customerSegment.ts) — keeping it computed rather than stored means
-- changing the thresholds later needs no migration, no backfill, ever.
-- `tags` is the separate, freeform, manually-assigned layer (e.g. "VIP" as
-- a tag someone applies by hand, independent of the auto-computed segment).

create table customers (
  id bigint generated always as identity primary key,
  name text not null,
  mobile text not null unique,
  whatsapp_number text,
  whatsapp_same_as_mobile boolean not null default true,
  date_of_birth date,
  anniversary date,
  address text,
  -- Used to decide CGST+SGST (same state as the shop, Punjab) vs IGST
  -- (different state) at billing time.
  state text,
  jewellery_preference text,
  ring_size text,
  total_lifetime_purchase numeric(12,2) not null default 0,
  outstanding_balance numeric(12,2) not null default 0,
  last_purchase_at timestamptz,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table customers enable row level security;

-- Any authenticated user can look a customer up (needed at the billing
-- counter by anyone permitted to bill, checked at the app layer via
-- billing:create — RLS here just needs "logged in", same pattern as items).
create policy "Authenticated users can view customers" on customers
  for select using (auth.uid() is not null);

create policy "Permitted users can insert customers" on customers
  for insert with check (has_permission('billing:create'));

create policy "Permitted users can update customers" on customers
  for update using (has_permission('billing:create'))
  with check (has_permission('billing:create'));
