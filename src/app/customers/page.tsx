"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CustomerRow, UserRole } from "@/types/database";
import { computeSegment, SEGMENT_LABEL } from "@/lib/customerSegment";
import Header from "@/components/Header";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";

const BLANK_FIELDS = {
  name: "",
  mobile: "",
  whatsappNumber: "",
  whatsappSameAsMobile: true,
  dateOfBirth: "",
  anniversary: "",
  address: "",
  state: "",
  jewelleryPreference: "",
  ringSize: "",
};

const inputCls =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-[14px] text-foreground outline-none focus:border-primary placeholder:text-faint";
const labelCls = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted";

const SEGMENT_STYLE: Record<string, string> = {
  new: "bg-info-bg text-info-text",
  high_value: "bg-warning-bg text-warning-text",
  inactive: "bg-divider-light text-faint",
  regular: "bg-success-bg text-success-text",
};

export default function CustomersPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "lifetime" | "recent" | "segment">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fields, setFields] = useState(BLANK_FIELDS);
  const [tagDraft, setTagDraft] = useState("");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
    setCanEdit(Boolean(allowed));
  }, [supabase]);

  const loadCustomers = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true })
      .returns<CustomerRow[]>();
    if (err) {
      setError(`Could not load customers: ${err.message}`);
      return;
    }
    setCustomers(data ?? []);
  }, [supabase]);

  useEffect(() => {
    async function initialLoad() {
      await Promise.all([loadUser(), loadCustomers()]);
      setLoading(false);
    }
    initialLoad();
  }, [loadUser, loadCustomers]);

  function resetForm() {
    setFields(BLANK_FIELDS);
    setFormTags([]);
    setTagDraft("");
    setEditingId(null);
    setShowForm(false);
  }

  function startNew() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(customer: CustomerRow) {
    setEditingId(customer.id);
    setFields({
      name: customer.name,
      mobile: customer.mobile,
      whatsappNumber: customer.whatsapp_number ?? "",
      whatsappSameAsMobile: customer.whatsapp_same_as_mobile,
      dateOfBirth: customer.date_of_birth ?? "",
      anniversary: customer.anniversary ?? "",
      address: customer.address ?? "",
      state: customer.state ?? "",
      jewelleryPreference: customer.jewellery_preference ?? "",
      ringSize: customer.ring_size ?? "",
    });
    setFormTags(customer.tags ?? []);
    setShowForm(true);
  }

  function addTag() {
    const t = tagDraft.trim();
    if (!t || formTags.includes(t)) {
      setTagDraft("");
      return;
    }
    setFormTags((prev) => [...prev, t]);
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setFormTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.name.trim() || !fields.mobile.trim()) {
      setError("Name and mobile number are required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const now = new Date().toISOString();

    // See ItemForm.tsx / UpdateRateForm.tsx for the `as never` rough edge -
    // a known TS-inference-only issue with our hand-written Database type,
    // not a runtime safety gap (Postgres still validates the row).
    const payload = {
      name: fields.name.trim(),
      mobile: fields.mobile.trim(),
      whatsapp_number: fields.whatsappSameAsMobile
        ? fields.mobile.trim()
        : fields.whatsappNumber.trim() || null,
      whatsapp_same_as_mobile: fields.whatsappSameAsMobile,
      date_of_birth: fields.dateOfBirth || null,
      anniversary: fields.anniversary || null,
      address: fields.address || null,
      state: fields.state || null,
      jewellery_preference: fields.jewelleryPreference || null,
      ring_size: fields.ringSize || null,
      tags: formTags,
      updated_at: now,
      updated_by: userEmail,
    };

    if (editingId == null) {
      const { error: insertErr } = await supabase
        .from("customers")
        .insert({ ...payload, created_at: now, created_by: userEmail } as never);
      setSubmitting(false);
      if (insertErr) {
        setError(
          insertErr.message.includes("duplicate")
            ? `A customer with mobile ${fields.mobile.trim()} already exists — search for them instead of creating a duplicate.`
            : `Could not save customer: ${insertErr.message}`
        );
        return;
      }
    } else {
      const { error: updateErr } = await supabase
        .from("customers")
        .update(payload as never)
        .eq("id", editingId);
      setSubmitting(false);
      if (updateErr) {
        setError(`Could not save customer: ${updateErr.message}`);
        return;
      }
    }

    resetForm();
    loadCustomers();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const SEGMENT_SORT_ORDER: Record<string, number> = { high_value: 0, regular: 1, new: 2, inactive: 3 };

  const filtered = customers
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return c.name.toLowerCase().includes(q) || c.mobile.includes(q);
    })
    .sort((a, b) => {
      let result = 0;
      if (sortBy === "name") {
        result = a.name.localeCompare(b.name);
      } else if (sortBy === "lifetime") {
        result = a.total_lifetime_purchase - b.total_lifetime_purchase;
      } else if (sortBy === "recent") {
        // Customers with no purchases yet sort to the end regardless of direction.
        const aTime = a.last_purchase_at ? new Date(a.last_purchase_at).getTime() : -Infinity;
        const bTime = b.last_purchase_at ? new Date(b.last_purchase_at).getTime() : -Infinity;
        result = aTime - bTime;
      } else if (sortBy === "segment") {
        result = SEGMENT_SORT_ORDER[computeSegment(a)] - SEGMENT_SORT_ORDER[computeSegment(b)];
      }
      return sortDir === "asc" ? result : -result;
    });

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <Header
        title="Naresh Jewellers"
        subtitle="Customers"
        userEmail={userEmail ?? undefined}
        userRole={userRole ?? undefined}
        onSignOut={handleSignOut}
      />
      <AppNav role={userRole} />

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8 pb-16">
        {loading && <div className="px-4 py-4 text-[13px] text-muted">Loading…</div>}
        {error && <div className="mb-4 px-4 py-3 text-[13px] text-danger-text">{error}</div>}

        {!loading && (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className={labelCls}>Search by name or mobile number</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="e.g. 98765 or Akanksha"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Sort by</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className={inputCls}
                >
                  <option value="name">Name</option>
                  <option value="lifetime">Lifetime purchase</option>
                  <option value="recent">Most recent purchase</option>
                  <option value="segment">Segment</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title={sortDir === "asc" ? "Ascending" : "Descending"}
                className="rounded-md border border-border px-3 py-2 text-[14px] text-muted hover:border-primary hover:text-primary-text"
              >
                {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={startNew}
                  className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white"
                >
                  + New Customer
                </button>
              )}
            </div>

            {!canEdit && (
              <div className="mb-4 rounded-lg bg-surface p-4 text-[13px] text-muted shadow-sm">
                You have view-only access to customers. Ask an admin to grant
                you billing access from Team &amp; Access to add or edit
                profiles.
              </div>
            )}

            {showForm && (
              <form
                onSubmit={handleSubmit}
                className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 rounded-lg bg-surface p-4 shadow-sm"
              >
                <div>
                  <label className={labelCls}>Name *</label>
                  <input
                    value={fields.name}
                    onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Mobile number *</label>
                  <input
                    value={fields.mobile}
                    onChange={(e) => setFields((f) => ({ ...f, mobile: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                    <input
                      type="checkbox"
                      checked={fields.whatsappSameAsMobile}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, whatsappSameAsMobile: e.target.checked }))
                      }
                    />
                    WhatsApp same as mobile
                  </label>
                  {!fields.whatsappSameAsMobile && (
                    <input
                      value={fields.whatsappNumber}
                      onChange={(e) => setFields((f) => ({ ...f, whatsappNumber: e.target.value }))}
                      placeholder="WhatsApp number"
                      className={inputCls}
                    />
                  )}
                </div>
                <div>
                  <label className={labelCls}>Date of birth</label>
                  <input
                    type="date"
                    value={fields.dateOfBirth}
                    onChange={(e) => setFields((f) => ({ ...f, dateOfBirth: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Anniversary</label>
                  <input
                    type="date"
                    value={fields.anniversary}
                    onChange={(e) => setFields((f) => ({ ...f, anniversary: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input
                    value={fields.state}
                    onChange={(e) => setFields((f) => ({ ...f, state: e.target.value }))}
                    placeholder="e.g. Punjab"
                    className={inputCls}
                  />
                </div>
                <div className="col-span-full">
                  <label className={labelCls}>Address</label>
                  <input
                    value={fields.address}
                    onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Jewellery preference</label>
                  <input
                    value={fields.jewelleryPreference}
                    onChange={(e) =>
                      setFields((f) => ({ ...f, jewelleryPreference: e.target.value }))
                    }
                    placeholder="e.g. Antique gold"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Ring size</label>
                  <input
                    value={fields.ringSize}
                    onChange={(e) => setFields((f) => ({ ...f, ringSize: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                <div className="col-span-full">
                  <label className={labelCls}>Tags</label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {formTags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-text"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          aria-label={`Remove tag ${tag}`}
                          className="ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="e.g. VIP, Prefers antique"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="rounded-md border border-border px-3 py-2 text-[13px] font-medium text-muted"
                    >
                      Add tag
                    </button>
                  </div>
                </div>

                <div className="col-span-full flex gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
                  >
                    {submitting ? "Saving…" : editingId == null ? "Save customer" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-md border border-border px-4 py-2 text-[14px] font-medium text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto rounded-lg bg-surface shadow-sm">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-divider text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Segment</th>
                    <th className="px-4 py-3">Tags</th>
                    <th className="px-4 py-3">Lifetime purchase</th>
                    <th className="px-4 py-3">Outstanding</th>
                    {canEdit && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="px-4 py-6 text-center text-muted">
                        No customers found.
                      </td>
                    </tr>
                  )}
                  {filtered.map((c) => {
                    const segment = computeSegment(c);
                    return (
                      <tr key={c.id} className="border-b border-divider-light last:border-0">
                        <td className="px-4 py-3">{c.name}</td>
                        <td className="px-4 py-3 font-mono text-[12px]">{c.mobile}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEGMENT_STYLE[segment]}`}
                          >
                            {SEGMENT_LABEL[segment]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {c.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-divider-light px-2 py-0.5 text-[10px] font-medium text-muted"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">₹{c.total_lifetime_purchase.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">
                          {c.outstanding_balance > 0 ? (
                            <span className="text-danger-text">
                              ₹{c.outstanding_balance.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted hover:border-primary hover:text-primary-text"
                            >
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-faint">
              Segments (New / Regular / High-Value / Inactive) are calculated
              automatically from purchase history using placeholder
              thresholds — worth confirming the real numbers once Billing is
              live and there's real purchase data. VIP and other custom
              labels are applied manually as tags.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
