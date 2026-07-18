-- 007: Admin-only item deletion. Run after migration 006.
--
-- Deleting an item is destructive: stock_log rows for that item cascade-
-- delete too (see `references items(id) on delete cascade` in migration
-- 005), so the full history for that item is gone, not just the current
-- row. Deliberately NOT wired into the has_permission()/PermissionKey
-- system used for inventory:edit and categories:edit - those are meant for
-- day-to-day grantable capabilities. Deletion is restricted to is_admin()
-- directly, so it can never be handed to an employee via /team.

create policy "Admins can delete items" on items
  for delete using (is_admin());
