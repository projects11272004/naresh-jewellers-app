-- Adds per-feature, per-employee permissions on top of the admin/employee
-- role from migration 002. Admins always have full access everywhere;
-- employees are view-only by default, and admin grants specific employees
-- specific permissions (starting with 'inventory:edit') one by one.
--
-- This is the pattern every future phase's edit permissions will follow -
-- add a new permission key string, no schema changes needed per phase.

-- 1) Store each employee's email on their profile row (so the admin's Team &
-- Access page can show who's who without needing service-role/admin API
-- calls from the client). Backfill existing rows, then keep it in sync going
-- forward via the signup trigger.
alter table profiles add column if not exists email text;

update profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (new.id, 'employee', new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

-- 2) permissions table — one row per (employee, permission) grant.
create table if not exists permissions (
  user_id uuid not null references profiles(id) on delete cascade,
  permission text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references profiles(id),
  primary key (user_id, permission)
);

alter table permissions enable row level security;

create policy "Users can view own permissions" on permissions
  for select using (auth.uid() = user_id);

create policy "Admins can view all permissions" on permissions
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can grant permissions" on permissions
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can revoke permissions" on permissions
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 3) Reusable helper for every future RLS policy that needs "admin, or
-- employee explicitly granted this permission". Use like:
--   create policy "..." on some_table for update using (has_permission('inventory:edit'));
create or replace function public.has_permission(check_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ) or exists (
    select 1 from permissions where user_id = auth.uid() and permission = check_permission
  );
$$;

-- 4) Admins need to see every employee (not just their own row) to manage
-- access on the Team & Access page.
create policy "Admins can view all profiles" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
