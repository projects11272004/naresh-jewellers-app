"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CategoryRow, CurrentRateRow, ItemRow, UserRole } from "@/types/database";
import Header from "@/components/Header";
import AppNav from "@/components/AppNav";
import ItemForm from "@/components/ItemForm";
import InventoryTable from "@/components/InventoryTable";

// Same reasoning as page.tsx: force dynamic rendering so this page always
// goes through middleware instead of being served from a static CDN cache.
export const dynamic = "force-dynamic";

export default function InventoryPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [rates, setRates] = useState<CurrentRateRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
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

    // Reuse the same has_permission() Postgres function RLS relies on, so
    // "can this person edit inventory" has exactly one source of truth
    // (admin, or a specific inventory:edit grant from /team) instead of
    // duplicating that OR-logic here in JS. Same `as never` rough edge as
    // elsewhere in this codebase (see UpdateRateForm.tsx) - our hand-written
    // Database type doesn't thread the RPC arg generic cleanly, but the
    // actual call is still validated by Postgres at runtime.
    const { data: allowed } = await supabase.rpc(
      "has_permission",
      { check_permission: "inventory:edit" } as never
    );
    setCanEdit(Boolean(allowed));
  }, [supabase]);

  const loadRates = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("current_rates")
      .select("*")
      .returns<CurrentRateRow[]>();
    if (err) {
      setError(`Could not load rates: ${err.message}`);
      return;
    }
    setRates(data ?? []);
  }, [supabase]);

  const loadItems = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("items")
      .select("*")
      .order("updated_at", { ascending: false })
      .returns<ItemRow[]>();
    if (err) {
      setError(`Could not load inventory: ${err.message}`);
      return;
    }
    setItems(data ?? []);
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
      await Promise.all([loadUser(), loadRates(), loadItems(), loadCategories()]);
      setLoading(false);
    }
    initialLoad();
  }, [loadUser, loadRates, loadItems, loadCategories]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-[#F5F6F8] text-[#1a1a1a]">
      <Header
        title="Naresh Jewellers"
        subtitle="Inventory"
        userEmail={userEmail ?? undefined}
        userRole={userRole ?? undefined}
        onSignOut={handleSignOut}
      />
      <AppNav role={userRole} />

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8 pb-16">
        {loading && (
          <div className="px-4 py-4 text-[13px] text-[#5B6472]">Loading inventory…</div>
        )}
        {error && <div className="px-4 py-4 text-[13px] text-[#B42318]">{error}</div>}

        {!loading && canEdit && userEmail && (
          <ItemForm userEmail={userEmail} categories={categories} onSaved={loadItems} />
        )}

        {!loading && !canEdit && (
          <div className="mb-6 rounded-lg bg-white p-4 text-[13px] text-[#5B6472] shadow-sm">
            You have view-only access to inventory. Ask an admin to grant you
            edit access from Team &amp; Access if you need to add or update items.
          </div>
        )}

        {!loading && (
          <InventoryTable items={items} rates={rates} categories={categories} canEdit={canEdit} />
        )}
      </main>
    </div>
  );
}
