-- 009: HSN/SAC codes on items, billing:create permission. Run after 008.
--
-- HSN code = tax classification for the physical goods (gold/silver material).
-- SAC code = tax classification for the labour/making-charge SERVICE,
-- distinct from HSN — this split is what the Tanishq reference invoice
-- showed and the client asked to match. Both nullable: existing items don't
-- have these yet, and the item form will treat missing HSN/SAC the same way
-- it already treats other missing pricing fields — shown as "Incomplete"
-- rather than blocking anything, so this migration never breaks existing data.

alter table items add column hsn_code text;
alter table items add column sac_code text;

-- billing:create is grantable per-employee, same pattern as inventory:edit
-- and categories:edit (admins always pass via has_permission()'s is_admin()
-- shortcut). Voiding a finalized bill is deliberately NOT part of this key —
-- per the client's decision, void stays admin-only via is_admin() directly,
-- the same way item deletion is (see migration 007) — so it can never be
-- handed to an employee through /team.
--
-- No schema change is needed to introduce the permission itself (it's just
-- a text value has_permission()/permissions already handle generically) —
-- this comment exists so the reasoning is on record next to the fields it
-- gates. The TypeScript PermissionKey type is updated to include it so it
-- shows up as a checkbox on /team.
