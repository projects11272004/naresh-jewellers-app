-- Adds authentication + role-based access (admin vs employee) on top of the
-- existing Phase 1 schema. Run this once in the Supabase SQL Editor on the
-- live project (ntqeasbmmbjgdulygium).
--
-- After running this, every page in the app requires a logged-in account.
-- Both admin and employee can view rates; only admin can edit them.

-- 1) profiles table — one row per auth user, holding their role.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  full_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

-- 2) Auto-create a profile (default role 'employee') whenever a new auth user
-- is created — so every account you add via the dashboard gets a row here
-- automatically, without you needing to insert it by hand.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'employee', new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3) Tighten current_rates / rate_log so viewing requires being logged in
-- (previously public/anon-readable), and only admins can write.
drop policy if exists "Public can view current rates" on current_rates;
drop policy if exists "Public can view rate history" on rate_log;

create policy "Authenticated users can view current rates" on current_rates
  for select using (auth.uid() is not null);

create policy "Authenticated users can view rate history" on rate_log
  for select using (auth.uid() is not null);

create policy "Admins can update current rates" on current_rates
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can log manual rate changes" on rate_log
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Note: the sync-rates Edge Function writes using the service_role key, which
-- bypasses RLS entirely — the daily automated sync keeps working unaffected
-- by these policies.

-- 4) One-time manual step: after creating your own login in the Supabase
-- dashboard (Authentication > Add user), promote yourself to admin. Replace
-- the email below with the one you actually used:
--
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
