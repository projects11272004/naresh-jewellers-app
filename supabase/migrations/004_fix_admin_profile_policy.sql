-- Fixes the "Admins can view all profiles" policy from migration 003, which
-- used a raw self-referencing subquery directly on `profiles` inside its own
-- RLS policy - a known source of RLS evaluating unexpectedly (rows silently
-- not matching) since the subquery is itself subject to the same table's RLS.
--
-- Fix: check admin status through a SECURITY DEFINER function instead, which
-- bypasses RLS for that internal lookup only (same safe pattern already used
-- by has_permission() in migration 003).

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles" on profiles
  for select using (is_admin());

-- Also rewrite has_permission() itself to avoid the same self-referencing
-- pattern for the admin check inside it (it queries profiles directly).
create or replace function public.has_permission(check_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_admin() or exists (
    select 1 from permissions where user_id = auth.uid() and permission = check_permission
  );
$$;

-- And the permissions table's admin-only policies, same fix.
drop policy if exists "Admins can view all permissions" on permissions;
create policy "Admins can view all permissions" on permissions
  for select using (is_admin());

drop policy if exists "Admins can grant permissions" on permissions;
create policy "Admins can grant permissions" on permissions
  for insert with check (is_admin());

drop policy if exists "Admins can revoke permissions" on permissions;
create policy "Admins can revoke permissions" on permissions
  for delete using (is_admin());

-- And current_rates / rate_log's admin-only write policies from migration 002.
drop policy if exists "Admins can update current rates" on current_rates;
create policy "Admins can update current rates" on current_rates
  for update using (is_admin()) with check (is_admin());

drop policy if exists "Admins can log manual rate changes" on rate_log;
create policy "Admins can log manual rate changes" on rate_log
  for insert with check (is_admin());
