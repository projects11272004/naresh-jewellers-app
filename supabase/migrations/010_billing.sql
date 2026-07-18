-- 010: Billing. Run after migration 009.
--
-- DESIGN NOTE ON TRUST: the line-item amounts (gold value, making charge,
-- discounts, tax) are computed client-side by src/lib/pricing.ts - the same
-- single source of truth Inventory already uses - and passed into
-- finalize_invoice() rather than recomputed in SQL. This mirrors how the
-- rest of the app already works (UpdateRateForm lets an admin set literally
-- any rate by hand; ItemForm lets a permitted employee set literally any
-- charge by hand) - RLS/has_permission() gates WHO can act, not whether
-- their numbers are second-guessed. What finalize_invoice() DOES guarantee,
-- which the client alone cannot, is ATOMICITY: creating the invoice, its
-- line items, marking every item sold, and updating the customer's totals
-- all happen in one database transaction. If anything fails partway
-- (e.g. someone else already sold one of the scanned items a second ago),
-- the whole bill is rolled back - never a half-saved invoice.

-- ---------------------------------------------------------------------------
-- 1. invoice_sequences - backs the financial-year invoice numbering.
--    Indian financial year runs Apr 1 - Mar 31, so the sequence resets each
--    year rather than running forever like item codes do. Only ever touched
--    from inside finalize_invoice() (SECURITY DEFINER), so no public RLS
--    policies are added - direct client access is denied by default.
-- ---------------------------------------------------------------------------

create table invoice_sequences (
  financial_year text primary key,
  next_seq integer not null default 1
);

alter table invoice_sequences enable row level security;

-- ---------------------------------------------------------------------------
-- 2. invoices / invoice_items
-- ---------------------------------------------------------------------------

create table invoices (
  id bigint generated always as identity primary key,
  invoice_number text unique not null,
  financial_year text not null,
  sequence_in_year integer not null,
  customer_id bigint not null references customers(id),
  -- Snapshotted, not looked up live, so a customer's later address change
  -- never rewrites the tax treatment of an already-issued invoice.
  customer_state_at_billing text,
  is_interstate boolean not null default false,
  subtotal numeric(12,2) not null,
  total_discount numeric(12,2) not null default 0,
  total_sgst numeric(12,2) not null default 0,
  total_cgst numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null,
  -- Split payment: [{ "method": "Cash", "amount": 1175.00 }, ...]
  payments jsonb not null default '[]',
  status text not null default 'completed' check (status in ('completed', 'void')),
  void_reason text,
  voided_by text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text
);

create table invoice_items (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references invoices(id) on delete cascade,
  -- Nullable + ON DELETE SET NULL: if an item is later hard-deleted from
  -- Inventory (admin-only, see migration 007), the invoice_items row
  -- survives intact as a legal record - every figure below is a snapshot,
  -- not a live lookup, so the invoice stays accurate even if the item row
  -- is gone.
  item_id bigint references items(id) on delete set null,
  barcode text not null,
  description text,
  hsn_code text,
  sac_code text,
  purity text,
  net_weight numeric,
  billing_weight numeric,
  -- The live rate/gram at the moment this item was added to the bill -
  -- locked in then, never re-fetched, so a rate change mid-sale can't
  -- silently alter an in-progress bill (see Stage-2 discussion).
  rate_per_gram numeric not null,
  gold_value numeric not null default 0,
  stone_charges numeric not null default 0,
  making_charge_amount numeric not null default 0,
  material_discount numeric not null default 0,
  stone_discount numeric not null default 0,
  labour_discount numeric not null default 0,
  material_taxable_amount numeric not null default 0,
  labour_taxable_amount numeric not null default 0,
  material_sgst numeric not null default 0,
  material_cgst numeric not null default 0,
  labour_sgst numeric not null default 0,
  labour_cgst numeric not null default 0,
  line_total numeric not null default 0
);

alter table invoices enable row level security;
alter table invoice_items enable row level security;

-- Invoices carry customer financial data, so - unlike items/categories,
-- which any authenticated user can view - SELECT here is restricted to
-- people who can actually bill, plus admins (via has_permission()'s
-- is_admin() shortcut).
create policy "Billing-permitted users can view invoices" on invoices
  for select using (has_permission('billing:create'));

create policy "Billing-permitted users can view invoice items" on invoice_items
  for select using (has_permission('billing:create'));

-- Deliberately NO insert/update policies here: all writes happen through
-- finalize_invoice() / void_invoice() below (SECURITY DEFINER, so they
-- bypass RLS for their own writes). Without an insert/update policy, RLS's
-- default-deny means the tables literally cannot be written to any other
-- way - the two functions are the only path in, which is what guarantees
-- the atomicity/validation they provide can't be bypassed.

-- ---------------------------------------------------------------------------
-- 3. finalize_invoice() - the only way an invoice is ever created.
-- ---------------------------------------------------------------------------

create or replace function public.finalize_invoice(
  p_customer_id bigint,
  p_customer_state text,
  p_is_interstate boolean,
  p_subtotal numeric,
  p_total_discount numeric,
  p_total_sgst numeric,
  p_total_cgst numeric,
  p_grand_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_created_by text
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_fy text;
  v_seq integer;
  v_invoice_number text;
  v_invoice_id bigint;
  v_item jsonb;
  v_item_id bigint;
  v_status text;
  v_barcode text;
begin
  if not has_permission('billing:create') then
    raise exception 'billing:create permission required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An invoice needs at least one item.';
  end if;

  -- Indian financial year: Apr 1 - Mar 31.
  if extract(month from now()) >= 4 then
    v_fy := extract(year from now())::text || '-' || right((extract(year from now()) + 1)::text, 2);
  else
    v_fy := (extract(year from now()) - 1)::text || '-' || right(extract(year from now())::text, 2);
  end if;

  insert into invoice_sequences (financial_year, next_seq) values (v_fy, 1)
    on conflict (financial_year) do nothing;

  update invoice_sequences set next_seq = next_seq + 1
    where financial_year = v_fy
    returning next_seq - 1 into v_seq;

  v_invoice_number := 'NJ/' || v_fy || '/' || lpad(v_seq::text, 5, '0');

  insert into invoices (
    invoice_number, financial_year, sequence_in_year, customer_id,
    customer_state_at_billing, is_interstate, subtotal, total_discount,
    total_sgst, total_cgst, grand_total, payments, status, created_by
  ) values (
    v_invoice_number, v_fy, v_seq, p_customer_id,
    p_customer_state, p_is_interstate, p_subtotal, p_total_discount,
    p_total_sgst, p_total_cgst, p_grand_total, p_payments, 'completed', p_created_by
  ) returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item ->> 'item_id')::bigint;
    v_barcode := v_item ->> 'barcode';

    -- Lock the row and re-check availability inside the transaction - this
    -- is what prevents two staff members from both scanning and selling
    -- the same physical item within moments of each other.
    select status into v_status from items where id = v_item_id for update;

    if v_status is null then
      raise exception 'Item % no longer exists.', v_barcode;
    elsif v_status <> 'in_stock' then
      raise exception 'Item % is no longer available (status: %). Someone may have just sold it - remove it from this bill and refresh.', v_barcode, v_status;
    end if;

    insert into invoice_items (
      invoice_id, item_id, barcode, description, hsn_code, sac_code, purity,
      net_weight, billing_weight, rate_per_gram, gold_value, stone_charges,
      making_charge_amount, material_discount, stone_discount, labour_discount,
      material_taxable_amount, labour_taxable_amount,
      material_sgst, material_cgst, labour_sgst, labour_cgst, line_total
    ) values (
      v_invoice_id, v_item_id, v_barcode, v_item ->> 'description',
      v_item ->> 'hsn_code', v_item ->> 'sac_code', v_item ->> 'purity',
      (v_item ->> 'net_weight')::numeric, (v_item ->> 'billing_weight')::numeric,
      (v_item ->> 'rate_per_gram')::numeric, (v_item ->> 'gold_value')::numeric,
      (v_item ->> 'stone_charges')::numeric, (v_item ->> 'making_charge_amount')::numeric,
      (v_item ->> 'material_discount')::numeric, (v_item ->> 'stone_discount')::numeric,
      (v_item ->> 'labour_discount')::numeric,
      (v_item ->> 'material_taxable_amount')::numeric, (v_item ->> 'labour_taxable_amount')::numeric,
      (v_item ->> 'material_sgst')::numeric, (v_item ->> 'material_cgst')::numeric,
      (v_item ->> 'labour_sgst')::numeric, (v_item ->> 'labour_cgst')::numeric,
      (v_item ->> 'line_total')::numeric
    );

    update items set status = 'sold', updated_at = now(), updated_by = p_created_by
      where id = v_item_id;

    insert into stock_log (item_id, action, note, changed_at, changed_by)
      values (v_item_id, 'sold', 'Invoice ' || v_invoice_number, now(), p_created_by);
  end loop;

  update customers set
    total_lifetime_purchase = total_lifetime_purchase + p_grand_total,
    last_purchase_at = now(),
    updated_at = now(),
    updated_by = p_created_by
    where id = p_customer_id;

  return v_invoice_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. void_invoice() - admin-only (see migration 007's reasoning for item
--    deletion; voiding a legal financial document gets the same treatment:
--    never a grantable permission, always is_admin() directly).
-- ---------------------------------------------------------------------------

create or replace function public.void_invoice(
  p_invoice_id bigint,
  p_reason text,
  p_voided_by text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status text;
  v_customer_id bigint;
  v_grand_total numeric;
  v_invoice_number text;
  v_row record;
begin
  if not is_admin() then
    raise exception 'Only admins can void an invoice.';
  end if;

  select status, customer_id, grand_total, invoice_number
    into v_status, v_customer_id, v_grand_total, v_invoice_number
    from invoices where id = p_invoice_id for update;

  if v_status is null then
    raise exception 'Invoice not found.';
  elsif v_status = 'void' then
    raise exception 'Invoice % is already void.', v_invoice_number;
  end if;

  update invoices set
    status = 'void', void_reason = p_reason, voided_by = p_voided_by, voided_at = now()
    where id = p_invoice_id;

  for v_row in select item_id from invoice_items where invoice_id = p_invoice_id and item_id is not null
  loop
    update items set status = 'in_stock', updated_at = now(), updated_by = p_voided_by
      where id = v_row.item_id;

    insert into stock_log (item_id, action, note, changed_at, changed_by)
      values (v_row.item_id, 'restocked', 'Voided invoice ' || v_invoice_number || coalesce(': ' || p_reason, ''), now(), p_voided_by);
  end loop;

  update customers set
    total_lifetime_purchase = greatest(0, total_lifetime_purchase - v_grand_total),
    updated_at = now(),
    updated_by = p_voided_by
    where id = v_customer_id;
end;
$$;
