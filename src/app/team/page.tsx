"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PermissionKey, ProfileRow, UserRole } from "@/types/database";
import Header from "@/components/Header";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";

// Every grantable permission shown on this page - add a row here whenever a
// future phase introduces a new admin-grantable permission key.
const GRANTABLE_PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: "inventory:edit", label: "Inventory — add/edit items" },
  { key: "categories:edit", label: "Categories — add/rename/deactivate" },
  { key: "billing:create", label: "Billing — create invoices & manage customers" },
];

export default function TeamAccessPage() {
  const router = useRouter();
  const supabase = createClient();

  const [viewerRole, setViewerRole] = useState<UserRole | null>(null);
  const [viewerEmail, setViewerEmail] = useState<string | null>(null);
  const [employees, setEmployees] = useState<ProfileRow[]>([]);
  const [grants, setGrants] = useState<Record<string, Set<PermissionKey>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setViewerEmail(user.email ?? null);

    const { data: myProfileRows } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .returns<{ role: UserRole }[]>();
    const myRole = myProfileRows?.[0]?.role ?? "employee";
    setViewerRole(myRole);

    if (myRole !== "admin") {
      setLoading(false);
      return;
    }

    const { data: profileRows, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true })
      .returns<ProfileRow[]>();

    if (profileErr) {
      setError(`Could not load team: ${profileErr.message}`);
      setLoading(false);
      return;
    }
    setEmployees((profileRows ?? []).filter((p) => p.role !== "admin"));

    const { data: permissionRows, error: permErr } = await supabase
      .from("permissions")
      .select("user_id, permission")
      .returns<{ user_id: string; permission: PermissionKey }[]>();

    if (permErr) {
      setError(`Could not load permissions: ${permErr.message}`);
      setLoading(false);
      return;
    }

    const grouped: Record<string, Set<PermissionKey>> = {};
    (permissionRows ?? []).forEach((row) => {
      if (!grouped[row.user_id]) grouped[row.user_id] = new Set();
      grouped[row.user_id].add(row.permission);
    });
    setGrants(grouped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function togglePermission(userId: string, permission: PermissionKey, enabled: boolean) {
    setError(null);
    if (enabled) {
      const { error: insertErr } = await supabase
        .from("permissions")
        .insert({ user_id: userId, permission } as never);
      if (insertErr) {
        setError(`Could not grant access: ${insertErr.message}`);
        return;
      }
    } else {
      const { error: deleteErr } = await supabase
        .from("permissions")
        .delete()
        .eq("user_id", userId)
        .eq("permission", permission);
      if (deleteErr) {
        setError(`Could not revoke access: ${deleteErr.message}`);
        return;
      }
    }

    setGrants((prev) => {
      const next = { ...prev };
      const current = new Set(next[userId] ?? []);
      if (enabled) current.add(permission);
      else current.delete(permission);
      next[userId] = current;
      return next;
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <Header
        title="Naresh Jewellers"
        subtitle="Team & Access"
        userEmail={viewerEmail ?? undefined}
        userRole={viewerRole ?? undefined}
        onSignOut={handleSignOut}
      />
      <AppNav role={viewerRole} />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-6 py-8 pb-16">
        {loading && (
          <div className="px-4 py-4 text-[13px] text-muted">Loading…</div>
        )}

        {!loading && viewerRole !== "admin" && (
          <div className="rounded-lg bg-surface p-6 text-[14px] text-danger-text shadow-sm">
            Only admins can view this page.
          </div>
        )}

        {!loading && viewerRole === "admin" && (
          <>
            <h2 className="mb-4 border-b-2 border-accent pb-2 text-[15px] uppercase tracking-wide text-muted">
              Employee Access
            </h2>

            {error && (
              <div className="mb-4 px-4 py-3 text-[13px] text-danger-text">{error}</div>
            )}

            {employees.length === 0 && (
              <div className="rounded-lg bg-surface p-6 text-[13px] text-muted shadow-sm">
                No employee accounts yet. Create one from the Supabase dashboard
                (Authentication → Add user) — it'll show up here automatically.
              </div>
            )}

            <div className="flex flex-col gap-3">
              {employees.map((employee) => {
                const employeeGrants = grants[employee.id] ?? new Set<PermissionKey>();
                return (
                  <div
                    key={employee.id}
                    className="rounded-lg bg-surface p-4 shadow-sm"
                  >
                    <div className="mb-2 text-[14px] font-semibold text-primary-text">
                      {employee.full_name || employee.email || employee.id}
                    </div>
                    {employee.full_name && employee.email && (
                      <div className="mb-3 text-[12px] text-faint">{employee.email}</div>
                    )}
                    <div className="flex flex-col gap-2">
                      {GRANTABLE_PERMISSIONS.map((perm) => (
                        <label
                          key={perm.key}
                          className="flex items-center gap-2 text-[13px] text-muted"
                        >
                          <input
                            type="checkbox"
                            checked={employeeGrants.has(perm.key)}
                            onChange={(e) =>
                              togglePermission(employee.id, perm.key, e.target.checked)
                            }
                          />
                          {perm.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
