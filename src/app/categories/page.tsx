"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryRow, UserRole } from "@/types/database";
import Header from "@/components/Header";
import AppNav from "@/components/AppNav";

// Same reasoning as inventory/page.tsx: force dynamic so this always goes
// through middleware instead of a static CDN cache.
export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserEmail(user.email ?? null);

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .returns<{ role: UserRole }[]>();
    setUserRole(profileRows?.[0]?.role ?? "employee");

    // Same pattern as inventory:edit elsewhere - single source of truth via
    // has_permission(), not duplicated JS logic.
    const { data: allowed } = await supabase.rpc(
      "has_permission",
      { check_permission: "categories:edit" } as never
    );
    setCanEdit(Boolean(allowed));
  }, [supabase]);

  const loadCategories = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true })
      .returns<CategoryRow[]>();
    if (err) {
      setError(`Could not load categories: ${err.message}`);
      return;
    }
    setCategories(data ?? []);
  }, [supabase]);

  useEffect(() => {
    async function initialLoad() {
      await Promise.all([loadUser(), loadCategories()]);
      setLoading(false);
    }
    initialLoad();
  }, [loadUser, loadCategories]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setBusy(true);
    setError(null);
    const { error: insertErr } = await supabase
      .from("categories")
      .insert({ name } as never);
    setBusy(false);

    if (insertErr) {
      setError(
        insertErr.message.includes("duplicate")
          ? `"${name}" already exists.`
          : `Could not add category: ${insertErr.message}`
      );
      return;
    }
    setNewName("");
    loadCategories();
  }

  async function toggleActive(cat: CategoryRow) {
    setError(null);
    const { error: updateErr } = await supabase
      .from("categories")
      .update({ active: !cat.active } as never)
      .eq("id", cat.id);
    if (updateErr) {
      setError(`Could not update category: ${updateErr.message}`);
      return;
    }
    loadCategories();
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
        subtitle="Categories"
        userEmail={userEmail ?? undefined}
        userRole={userRole ?? undefined}
        onSignOut={handleSignOut}
      />
      <AppNav role={userRole} />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-6 py-8 pb-16">
        {loading && <div className="px-4 py-4 text-[13px] text-muted">Loading…</div>}

        {!loading && !canEdit && (
          <div className="rounded-lg bg-surface p-6 text-[14px] text-danger-text shadow-sm">
            You don&apos;t have access to manage categories. Ask an admin to grant
            it from Team &amp; Access.
          </div>
        )}

        {!loading && canEdit && (
          <>
            <h2 className="mb-4 border-b-2 border-accent pb-2 text-[15px] uppercase tracking-wide text-muted">
              Item Categories
            </h2>

            {error && <div className="mb-4 text-[13px] text-danger-text">{error}</div>}

            <form onSubmit={handleAdd} className="mb-6 flex gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New category name"
                className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-[14px] text-foreground outline-none focus:border-primary placeholder:text-faint"
              />
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
              >
                Add
              </button>
            </form>

            <div className="overflow-hidden rounded-lg bg-surface shadow-sm">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-divider text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.id} className="border-b border-divider-light last:border-0">
                      <td className={`px-4 py-3 ${!cat.active ? "text-faint" : "text-foreground"}`}>{cat.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            cat.active ? "bg-success-bg text-success-text" : "bg-divider-light text-faint"
                          }`}
                        >
                          {cat.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(cat)}
                          className="rounded-md border border-border px-3 py-1 text-[12px] font-medium text-muted hover:border-primary hover:text-primary-text"
                        >
                          {cat.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-faint">
              Deactivating hides a category from the item form dropdown but
              keeps it (and any items already using it) intact — nothing is
              ever deleted.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
