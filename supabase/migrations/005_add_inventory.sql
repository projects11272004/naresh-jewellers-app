-- Phase 2: Inventory. Run after migration 004.
--
-- Items are keyed by barcode (you print/assign your own tags in-house).
-- Scanning a barcode that already exists opens that item for edit; scanning
-- an unrecognized one starts a new item with the barcode pre-filled - that
-- lookup-or-create logic lives in the frontend, not the database.

create table items (
  id bigint generated always as identity primary key,
  barcode text not null unique,
  huid text,
  item_name text,
  purity text check (purity in ('24K','22K','18K','14K','Silver')),
  gross_weight numeric(10,3),
  net_weight numeric(10,3),
  stone_weight numeric(10,3) not null default 0,
  stone_charges numeric(10,2) not null default 0,
  making_charge_type text check (making_charge_type in ('percentage','per_gram','flat')),
  making_charge_value numeric(10,2),
  wastage_pct numeric(5,2) not null default 0,
  status text not null default 'in_stock' check (status in ('in_stock','sold','transferred','written_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

-- Append-only audit trail, same pattern as rate_log - every save writes one
-- row here so you can see the full history of an item (created, edited,
-- sold, etc.) even though `items` itself only holds current state.
create table stock_log (
  id bigint generated always as identity primary key,
  item_id bigint not null references items(id) on delete cascade,
  action text not null check (action in ('created','updated','sold','transferred','written_off','restocked')),
  note text,
  changed_at timestamptz not null default now(),
  changed_by text
);

alter table items enable row level security;
alter table stock_log enable row level security;

-- Everyone logged in can view stock (admin or employee, regardless of
-- inventory:edit) - only adding/editing is gated.
create policy "Authenticated users can view items" on items
  for select using (auth.uid() is not null);

create policy "Permitted users can insert items" on items
  for insert with check (has_permission('inventory:edit'));

create policy "Permitted users can update items" on items
  for update using (has_permission('inventory:edit'))
  with check (has_permission('inventory:edit'));

create policy "Authenticated users can view stock log" on stock_log
  for select using (auth.uid() is not null);

create policy "Permitted users can insert stock log entries" on stock_log
  for insert with check (has_permission('inventory:edit'));
