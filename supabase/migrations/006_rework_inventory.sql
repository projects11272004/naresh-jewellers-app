-- 006: Inventory rework. Run after migration 005.
--
-- What this does:
--   1. Adds an admin-editable `categories` table (seeded with the shop's
--      category list) and a new grantable permission key `categories:edit`
--      (admins always pass via has_permission's is_admin() shortcut).
--   2. Adds a database-generated item code: NJ00001, NJ00002, ... via
--      generate_item_code(). The portal calls this when creating a new item;
--      the same string is what gets encoded in the printed barcode.
--   3. Reworks `items`:
--        + category_id            (FK to categories)
--        + has_stone / stone_type / stone_pieces   (stone section toggle)
--        + has_polish / polish_pct                 (replaces wastage_pct)
--        + making_charge_per_gram                  (making charges are
--          per-gram only now; the old percentage/flat options are removed)
--        - wastage_pct, making_charge_type, making_charge_value  (dropped)
--
-- Existing data is migrated, not lost:
--   * wastage_pct > 0        -> has_polish = true, polish_pct = old value
--   * stone weight/charges>0 -> has_stone = true
--   * making_charge_type 'per_gram' -> value copied to making_charge_per_gram.
--     Items that used 'percentage' or 'flat' get NULL and will show
--     "Incomplete" in the list until someone re-enters a per-gram charge.

-- ---------------------------------------------------------------------------
-- 1. Categories
-- ---------------------------------------------------------------------------

create table categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text
);

alter table categories enable row level security;

create policy "Authenticated users can view categories" on categories
  for select using (auth.uid() is not null);

-- Standard pattern (see migration 004): always has_permission(), never a raw
-- subquery. Admins pass automatically because has_permission() checks
-- is_admin() first.
create policy "Permitted users can insert categories" on categories
  for insert with check (has_permission('categories:edit'));

create policy "Permitted users can update categories" on categories
  for update using (has_permission('categories:edit'))
  with check (has_permission('categories:edit'));

-- Seed: the cleaned category list agreed with the client (transcription
-- duplicates like signity/dignity, polki/polykey, locket/locate merged;
-- garbled entries skipped - admin adds those from the app with correct
-- spellings).
insert into categories (name) values
  ('Baby Kada Gold'),
  ('Baby Bracelet Gold'),
  ('Baby Nazariya Gold'),
  ('Baby Ring Gold'),
  ('Baby Ring Diamond'),
  ('Bangle Diamond'),
  ('Bangle Machine-Made Gold'),
  ('Bangle Handmade Gold'),
  ('Kada'),
  ('Kada Gents Gold'),
  ('Kada Ladies'),
  ('Kada Solid Rhodium'),
  ('Bracelet Ladies Gold'),
  ('Bracelet Ladies Signity'),
  ('Bracelet Gents'),
  ('Chain Gold'),
  ('Chain Rhodium'),
  ('Italian Chain'),
  ('Chain Set Gold'),
  ('Chain Set Antique'),
  ('Chain Set Rhodium'),
  ('Chain Set Signity'),
  ('Gents Ring Gold'),
  ('Gents Ring Signity'),
  ('Gents Ring Diamond'),
  ('Ladies Ring Gold'),
  ('Ladies Ring Signity'),
  ('Ladies Ring Diamond'),
  ('Copper Ring'),
  ('Silver Ring'),
  ('Ring Silver Nag'),
  ('Big Set Gold'),
  ('Big Set Polki'),
  ('Set Gold'),
  ('Set Gold Rhodium'),
  ('Set Polki'),
  ('Set Signity'),
  ('Set Jadau'),
  ('Kundan Set Gold'),
  ('Small Set Gold'),
  ('Small Set Diamond'),
  ('Small Set Polki'),
  ('Jhumki Gold'),
  ('Jhumki Fancy'),
  ('Hanging Gold'),
  ('Hanging Signity'),
  ('Tops Gold'),
  ('Tops Diamond'),
  ('Tops Signity'),
  ('Tops Polki Gold'),
  ('Tops Gold Italian'),
  ('Bali Gold'),
  ('Bali Diamond'),
  ('Bali Signity'),
  ('Pendant Gold'),
  ('Pendant Diamond'),
  ('Pendant Set Gold'),
  ('Pendant Set Diamond'),
  ('Pendant Set Signity'),
  ('Pendant Set Polki'),
  ('Locket Gold'),
  ('Locket Kundan'),
  ('Locket Diamond'),
  ('Locket Signity'),
  ('Rudraksh Locket Gold'),
  ('Kanta Pendant'),
  ('Kanta Set'),
  ('Mangalsutra'),
  ('Mangalsutra Chain'),
  ('Mangalsutra Diamond'),
  ('Mangalsutra Ladi'),
  ('Tikka Gold'),
  ('Nath Gold'),
  ('Nosepin'),
  ('Nosepin Diamond'),
  ('Payal Gold'),
  ('Payal Silver'),
  ('Ruby'),
  ('Emerald'),
  ('Coral'),
  ('Cat''s Eye'),
  ('Blue Sapphire'),
  ('Yellow Sapphire'),
  ('Gemstone'),
  ('Silver Item'),
  ('Silver Bracelet'),
  ('Silver Chain'),
  ('Silver Kada'),
  ('Silver Locket'),
  ('Silver Old'),
  ('Silver'),
  ('Gold Item'),
  ('Pure Gold'),
  ('Chimni Gold'),
  ('Repair Item'),
  ('Order New');

-- ---------------------------------------------------------------------------
-- 2. Item code generator: NJ00001, NJ00002, ...
-- ---------------------------------------------------------------------------

create sequence item_code_seq start 1;

-- SECURITY DEFINER so authenticated app users can pull the next number
-- without needing direct sequence grants. Gated by the same permission that
-- gates inserting items, so it can't be abused to burn numbers.
create or replace function public.generate_item_code()
returns text
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not has_permission('inventory:edit') then
    raise exception 'inventory:edit permission required';
  end if;
  return 'NJ' || lpad(nextval('item_code_seq')::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Items rework
-- ---------------------------------------------------------------------------

alter table items add column category_id bigint references categories(id);
alter table items add column has_stone boolean not null default false;
alter table items add column stone_type text;
alter table items add column stone_pieces integer;
alter table items add column has_polish boolean not null default false;
alter table items add column polish_pct numeric(5,2);
alter table items add column making_charge_per_gram numeric(10,2);

-- Migrate existing rows before dropping old columns.
update items set has_polish = true, polish_pct = wastage_pct where wastage_pct > 0;
update items set has_stone = true where stone_weight > 0 or stone_charges > 0;
update items set making_charge_per_gram = making_charge_value
  where making_charge_type = 'per_gram' and making_charge_value is not null;

alter table items drop column wastage_pct;
alter table items drop column making_charge_type;
alter table items drop column making_charge_value;
