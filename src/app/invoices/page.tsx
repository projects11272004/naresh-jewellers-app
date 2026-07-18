"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CustomerRow, InvoiceItemRow, InvoiceRow, UserRole } from "@/types/database";
import { printInvoice } from "@/lib/invoicePrint";
import { formatDateTime } from "@/lib/format";
import Header from "@/components/Header";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";

function money(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InvoicesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [canView, setCanView] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [customersById, setCustomersById] = useState<Map<number, CustomerRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");

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

    const { data: allowed } = await supabase.rpc(
      "has_permission",
      { check_permission: "billing:create" } as never
    );
    setCanView(Boolean(allowed));
  }, [supabase]);

  const loadInvoices = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<InvoiceRow[]>();
    if (err) {
      setError(`Could not load invoices: ${err.message}`);
      return;
    }
    setInvoices(data ?? []);

    const customerIds = [...new Set((data ?? []).map((i) => i.customer_id))];
    if (customerIds.length) {
      const { data: customers } = await supabase
        .from("customers")
        .select("*")
        .in("id", customerIds)
        .returns<CustomerRow[]>();
      setCustomersById(new Map((customers ?? []).map((c) => [c.id, c])));
    }
  }, [supabase]);

  useEffect(() => {
    async function initialLoad() {
      await Promise.all([loadUser(), loadInvoices()]);
      setLoading(false);
    }
    initialLoad();
  }, [loadUser, loadInvoices]);

  async function handleReprint(invoice: InvoiceRow) {
    const customer = customersById.get(invoice.customer_id);
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .returns<InvoiceItemRow[]>();

    printInvoice({
      invoice,
      items: items ?? [],
      customer: {
        name: customer?.name ?? "—",
        mobile: customer?.mobile ?? "—",
        address: customer?.address ?? null,
        state: customer?.state ?? null,
      },
    });
  }

  async function handleVoid(invoice: InvoiceRow) {
    setError(null);
    const { error: err } = await supabase.rpc(
      "void_invoice",
      {
        p_invoice_id: invoice.id,
        p_reason: voidReason.trim() || null,
        p_voided_by: userEmail,
      } as never
    );
    setVoidingId(null);
    setVoidReason("");
    if (err) {
      setError(`Could not void ${invoice.invoice_number}: ${err.message}`);
      return;
    }
    loadInvoices();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <Header title="Naresh Jewellers" subtitle="Invoices" userEmail={userEmail ?? undefined} userRole={userRole ?? undefined} onSignOut={handleSignOut} />
      <AppNav role={userRole} />

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8 pb-16">
        {loading && <div className="px-4 py-4 text-[13px] text-muted">Loading…</div>}
        {error && <div className="mb-4 text-[13px] text-danger-text">{error}</div>}

        {!loading && !canView && (
          <div className="rounded-lg bg-surface p-6 text-[14px] text-danger-text shadow-sm">
            You don&apos;t have billing access. Ask an admin to grant it from Team &amp; Access.
          </div>
        )}

        {!loading && canView && (
          <div className="overflow-x-auto rounded-lg bg-surface shadow-sm">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-divider text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted">No invoices yet.</td>
                  </tr>
                )}
                {invoices.map((inv) => {
                  const customer = customersById.get(inv.customer_id);
                  return (
                    <tr key={inv.id} className="border-b border-divider-light last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px]">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-faint">{formatDateTime(inv.created_at)}</td>
                      <td className="px-4 py-3">{customer?.name ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-primary-text">{money(inv.grand_total)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            inv.status === "void" ? "bg-danger-bg text-danger-text" : "bg-success-bg text-success-text"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleReprint(inv)}
                            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted hover:border-primary hover:text-primary-text"
                          >
                            Reprint
                          </button>
                          {userRole === "admin" && inv.status === "completed" && (
                            voidingId === inv.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  value={voidReason}
                                  onChange={(e) => setVoidReason(e.target.value)}
                                  placeholder="Reason (optional)"
                                  className="rounded-md border border-border bg-transparent px-2 py-1 text-[11px] text-foreground outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleVoid(inv)}
                                  className="rounded-md bg-danger-text px-2 py-1 text-[11px] font-medium text-white"
                                >
                                  Confirm void
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setVoidingId(null); setVoidReason(""); }}
                                  className="rounded-md border border-border px-2 py-1 text-[11px] text-muted"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setVoidingId(inv.id)}
                                className="rounded-md border border-danger-border px-2 py-1 text-[11px] font-medium text-danger-text hover:bg-danger-bg"
                              >
                                Void
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
