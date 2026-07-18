"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  CurrentRateRow,
  CustomerRow,
  InvoiceItemRow,
  InvoiceRow,
  ItemRow,
  PaymentLine,
  PaymentMethod,
  UserRole,
} from "@/types/database";
import { calculateInvoiceLineBreakdown } from "@/lib/pricing";
import { isInterstateSale } from "@/lib/shopInfo";
import { printInvoice } from "@/lib/invoicePrint";
import Header from "@/components/Header";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";

const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "Card", "UPI", "Cheque", "Other"];
const ROUNDING_TOLERANCE = 2; // rupees - small gap between payment total and grand total is fine

interface BillLine {
  item: ItemRow;
  rate: number; // locked in at the moment this item was scanned onto the bill
  materialDiscount: string;
  stoneDiscount: string;
  labourDiscount: string;
}

const inputCls =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-[14px] text-foreground outline-none focus:border-primary placeholder:text-faint";
const labelCls = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted";

function money(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillingPage() {
  const router = useRouter();
  const supabase = createClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [canBill, setCanBill] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<CurrentRateRow[]>([]);

  // Customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerMobile, setNewCustomerMobile] = useState("");
  const [newCustomerState, setNewCustomerState] = useState("");

  // Bill lines
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lines, setLines] = useState<BillLine[]>([]);
  const [scanBusy, setScanBusy] = useState(false);

  // Payments
  const [payments, setPayments] = useState<{ method: PaymentMethod; amount: string }[]>([
    { method: "Cash", amount: "" },
    { method: "UPI", amount: "" },
  ]);

  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [finalizing, setFinalizing] = useState(false);

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
    setCanBill(Boolean(allowed));
  }, [supabase]);

  const loadRates = useCallback(async () => {
    const { data } = await supabase.from("current_rates").select("*").returns<CurrentRateRow[]>();
    setRates(data ?? []);
  }, [supabase]);

  useEffect(() => {
    async function initialLoad() {
      await Promise.all([loadUser(), loadRates()]);
      setLoading(false);
    }
    initialLoad();
  }, [loadUser, loadRates]);

  // --- Customer search ---
  async function handleCustomerSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = customerSearch.trim();
    if (!q) return;
    const { data } = await supabase
      .from("customers")
      .select("*")
      .or(`mobile.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(10)
      .returns<CustomerRow[]>();
    setCustomerResults(data ?? []);
    if ((data ?? []).length === 0) {
      setShowNewCustomer(true);
      setNewCustomerMobile(/^\d+$/.test(q) ? q : "");
      setNewCustomerName(/^\d+$/.test(q) ? "" : q);
    }
  }

  async function handleCreateCustomer() {
    if (!newCustomerName.trim() || !newCustomerMobile.trim()) {
      setMessage({ type: "error", text: "Name and mobile are required to create a customer." });
      return;
    }
    const now = new Date().toISOString();
    const { data, error: err } = await supabase
      .from("customers")
      .insert({
        name: newCustomerName.trim(),
        mobile: newCustomerMobile.trim(),
        whatsapp_number: newCustomerMobile.trim(),
        whatsapp_same_as_mobile: true,
        state: newCustomerState.trim() || null,
        created_at: now,
        created_by: userEmail,
        updated_at: now,
        updated_by: userEmail,
      } as never)
      .select("*")
      .returns<CustomerRow[]>();

    if (err) {
      setMessage({
        type: "error",
        text: err.message.includes("duplicate")
          ? "A customer with that mobile number already exists — search for them instead."
          : `Could not create customer: ${err.message}`,
      });
      return;
    }
    if (data?.[0]) {
      setSelectedCustomer(data[0]);
      setShowNewCustomer(false);
      setCustomerResults([]);
      setCustomerSearch("");
    }
  }

  // --- Item scanning ---
  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    if (lines.some((l) => l.item.barcode === code)) {
      setMessage({ type: "error", text: `${code} is already on this bill.` });
      setBarcodeInput("");
      return;
    }

    setScanBusy(true);
    setMessage(null);
    const { data, error: err } = await supabase
      .from("items")
      .select("*")
      .eq("barcode", code)
      .returns<ItemRow[]>();
    setScanBusy(false);
    setBarcodeInput("");
    barcodeInputRef.current?.focus();

    if (err) {
      setMessage({ type: "error", text: `Lookup failed: ${err.message}` });
      return;
    }

    const item = data?.[0];
    if (!item) {
      setMessage({ type: "error", text: `No item found for ${code}.` });
      return;
    }
    if (item.status !== "in_stock") {
      setMessage({ type: "error", text: `${code} is not available (status: ${item.status.replace("_", " ")}).` });
      return;
    }

    const rate = item.purity ? (rates.find((r) => r.purity === item.purity)?.rate_per_gram ?? null) : null;
    const breakdown = rate != null ? calculateInvoiceLineBreakdown(item, rate) : null;
    if (!breakdown) {
      setMessage({
        type: "error",
        text: `${code} is missing pricing details (purity, weight, or making charge) and can't be billed yet — finish it in Inventory first.`,
      });
      return;
    }

    setLines((prev) => [
      ...prev,
      { item, rate: rate as number, materialDiscount: "", stoneDiscount: "", labourDiscount: "" },
    ]);
  }

  function removeLine(barcode: string) {
    setLines((prev) => prev.filter((l) => l.item.barcode !== barcode));
  }

  function updateLineDiscount(barcode: string, field: "materialDiscount" | "stoneDiscount" | "labourDiscount", value: string) {
    setLines((prev) => prev.map((l) => (l.item.barcode === barcode ? { ...l, [field]: value } : l)));
  }

  // --- Payments ---
  function updatePayment(index: number, field: "method" | "amount", value: string) {
    setPayments((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  }
  function addPaymentLine() {
    setPayments((prev) => [...prev, { method: "Cash", amount: "" }]);
  }
  function removePaymentLine(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  // --- Totals ---
  const breakdowns = lines.map((l) =>
    calculateInvoiceLineBreakdown(l.item, l.rate, {
      materialDiscount: Number(l.materialDiscount) || 0,
      stoneDiscount: Number(l.stoneDiscount) || 0,
      labourDiscount: Number(l.labourDiscount) || 0,
    })
  );
  const subtotal = breakdowns.reduce((s, b) => s + (b ? b.materialTaxableAmount + b.labourTaxableAmount : 0), 0);
  const totalDiscount = lines.reduce(
    (s, l) => s + (Number(l.materialDiscount) || 0) + (Number(l.stoneDiscount) || 0) + (Number(l.labourDiscount) || 0),
    0
  );
  const totalSgst = breakdowns.reduce((s, b) => s + (b ? b.materialSgst + b.labourSgst : 0), 0);
  const totalCgst = breakdowns.reduce((s, b) => s + (b ? b.materialCgst + b.labourCgst : 0), 0);
  const grandTotal = subtotal + totalSgst + totalCgst;

  const interstate = isInterstateSale(selectedCustomer?.state);
  const paymentsTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paymentsMismatch = Math.abs(paymentsTotal - grandTotal) > ROUNDING_TOLERANCE;

  async function handleFinalize() {
    if (!selectedCustomer) {
      setMessage({ type: "error", text: "Select or create a customer first." });
      return;
    }
    if (lines.length === 0) {
      setMessage({ type: "error", text: "Add at least one item to the bill." });
      return;
    }
    if (paymentsMismatch) {
      setMessage({
        type: "error",
        text: `Payment total (${money(paymentsTotal)}) doesn't match the bill total (${money(grandTotal)}).`,
      });
      return;
    }

    setFinalizing(true);
    setMessage(null);

    const itemsPayload = lines.map((l, i) => {
      const b = breakdowns[i]!;
      return {
        item_id: l.item.id,
        barcode: l.item.barcode,
        description: l.item.item_name,
        hsn_code: l.item.hsn_code,
        sac_code: l.item.sac_code,
        purity: l.item.purity,
        net_weight: l.item.net_weight,
        billing_weight: b.billingWeight,
        rate_per_gram: l.rate,
        gold_value: b.goldValue,
        stone_charges: b.stoneCharges,
        making_charge_amount: b.makingChargeAmount,
        material_discount: b.materialDiscount,
        stone_discount: b.stoneDiscount,
        labour_discount: b.labourDiscount,
        material_taxable_amount: b.materialTaxableAmount,
        labour_taxable_amount: b.labourTaxableAmount,
        material_sgst: b.materialSgst,
        material_cgst: b.materialCgst,
        labour_sgst: b.labourSgst,
        labour_cgst: b.labourCgst,
        line_total: b.lineTotal,
      };
    });

    const paymentsPayload: PaymentLine[] = payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({ method: p.method, amount: Number(p.amount) }));

    // See migration 010 for why this is a single RPC rather than several
    // sequential inserts: it makes the whole bill atomic (invoice + line
    // items + marking every item sold + updating the customer's totals all
    // succeed together or all roll back).
    const { data: invoiceNumber, error: err } = await supabase.rpc(
      "finalize_invoice",
      {
        p_customer_id: selectedCustomer.id,
        p_customer_state: selectedCustomer.state,
        p_is_interstate: interstate,
        p_subtotal: subtotal,
        p_total_discount: totalDiscount,
        p_total_sgst: totalSgst,
        p_total_cgst: totalCgst,
        p_grand_total: grandTotal,
        p_payments: paymentsPayload,
        p_items: itemsPayload,
        p_created_by: userEmail,
      } as never
    );

    setFinalizing(false);

    if (err) {
      setMessage({ type: "error", text: `Could not finalize bill: ${err.message}` });
      return;
    }

    setMessage({ type: "ok", text: `Invoice ${invoiceNumber} created.` });

    // Fetch the full saved record back to print an exact copy of what's now
    // in the database (rather than reprinting the in-memory draft).
    const { data: savedInvoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("invoice_number", invoiceNumber as string)
      .returns<InvoiceRow[]>();
    const { data: savedItems } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", savedInvoice?.[0]?.id ?? -1)
      .returns<InvoiceItemRow[]>();

    if (savedInvoice?.[0]) {
      printInvoice({
        invoice: savedInvoice[0],
        items: savedItems ?? [],
        customer: {
          name: selectedCustomer.name,
          mobile: selectedCustomer.mobile,
          address: selectedCustomer.address,
          state: selectedCustomer.state,
        },
      });
    }

    // Reset for the next bill.
    setLines([]);
    setSelectedCustomer(null);
    setPayments([
      { method: "Cash", amount: "" },
      { method: "UPI", amount: "" },
    ]);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <Header title="Naresh Jewellers" subtitle="Billing" userEmail={userEmail ?? undefined} userRole={userRole ?? undefined} onSignOut={handleSignOut} />
      <AppNav role={userRole} />

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8 pb-16">
        {loading && <div className="px-4 py-4 text-[13px] text-muted">Loading…</div>}

        {!loading && !canBill && (
          <div className="rounded-lg bg-surface p-6 text-[14px] text-danger-text shadow-sm">
            You don&apos;t have billing access. Ask an admin to grant it from Team &amp; Access.
          </div>
        )}

        {!loading && canBill && (
          <>
            {message && (
              <div className={`mb-4 text-[13px] ${message.type === "ok" ? "text-success-text" : "text-danger-text"}`}>
                {message.text}
              </div>
            )}

            {/* Customer */}
            <div className="mb-6 rounded-lg bg-surface p-4 shadow-sm">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">Customer</h2>
              {selectedCustomer ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[15px] font-semibold text-primary-text">{selectedCustomer.name}</div>
                    <div className="text-[12px] text-faint">
                      {selectedCustomer.mobile} {selectedCustomer.state ? `· ${selectedCustomer.state}` : "· No state on file (assumed intra-state)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-muted"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <form onSubmit={handleCustomerSearch} className="mb-3 flex gap-3">
                    <input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search by mobile number or name"
                      className={inputCls}
                    />
                    <button type="submit" className="rounded-md bg-secondary px-4 py-2 text-[14px] font-medium text-white">
                      Search
                    </button>
                  </form>
                  {customerResults.length > 0 && (
                    <div className="mb-3 flex flex-col gap-2">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerResults([]);
                          }}
                          className="rounded-md border border-border px-3 py-2 text-left text-[13px] hover:border-primary"
                        >
                          <span className="font-semibold">{c.name}</span> — {c.mobile}
                        </button>
                      ))}
                    </div>
                  )}
                  {!showNewCustomer && (
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(true)}
                      className="text-[12px] font-medium text-primary-text underline"
                    >
                      + Create new customer
                    </button>
                  )}
                  {showNewCustomer && (
                    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 rounded-md border border-border p-3">
                      <div>
                        <label className={labelCls}>Name *</label>
                        <input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Mobile *</label>
                        <input value={newCustomerMobile} onChange={(e) => setNewCustomerMobile(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>State</label>
                        <input
                          value={newCustomerState}
                          onChange={(e) => setNewCustomerState(e.target.value)}
                          placeholder="e.g. Punjab"
                          className={inputCls}
                        />
                      </div>
                      <div className="col-span-full flex gap-3">
                        <button
                          type="button"
                          onClick={handleCreateCustomer}
                          className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white"
                        >
                          Save &amp; select
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNewCustomer(false)}
                          className="rounded-md border border-border px-4 py-2 text-[14px] font-medium text-muted"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="col-span-full text-[11px] text-faint">
                        More fields (DOB, anniversary, tags, etc.) can be added later from the Customers page.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Scan items */}
            <div className="mb-6 rounded-lg bg-surface p-4 shadow-sm">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">Items</h2>
              <form onSubmit={handleScan} className="mb-4 flex gap-3">
                <input
                  ref={barcodeInputRef}
                  autoFocus
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan item barcode, then Enter"
                  className={inputCls}
                />
                <button type="submit" disabled={scanBusy} className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60">
                  {scanBusy ? "…" : "Add"}
                </button>
              </form>

              {lines.length === 0 && <div className="text-[13px] text-faint">No items scanned yet.</div>}

              {lines.map((l, i) => {
                const b = breakdowns[i];
                return (
                  <div key={l.item.barcode} className="mb-3 rounded-md border border-divider-light p-3 last:mb-0">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[12px]">{l.item.barcode}</span>
                        <span className="ml-2 text-[13px] font-semibold">{l.item.item_name || "—"}</span>
                        <span className="ml-2 text-[12px] text-faint">
                          {l.item.purity} · {l.item.net_weight}g @ {money(l.rate)}/g
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(l.item.barcode)}
                        className="rounded-md border border-danger-border px-2 py-1 text-[11px] font-medium text-danger-text"
                      >
                        Remove
                      </button>
                    </div>
                    {b && (
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
                        <div>
                          <label className={labelCls}>Material discount</label>
                          <input
                            type="number"
                            min="0"
                            value={l.materialDiscount}
                            onChange={(e) => updateLineDiscount(l.item.barcode, "materialDiscount", e.target.value)}
                            placeholder="₹0"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Stone discount</label>
                          <input
                            type="number"
                            min="0"
                            value={l.stoneDiscount}
                            onChange={(e) => updateLineDiscount(l.item.barcode, "stoneDiscount", e.target.value)}
                            placeholder="₹0"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Labour discount</label>
                          <input
                            type="number"
                            min="0"
                            value={l.labourDiscount}
                            onChange={(e) => updateLineDiscount(l.item.barcode, "labourDiscount", e.target.value)}
                            placeholder="₹0"
                            className={inputCls}
                          />
                        </div>
                        <div className="flex items-end justify-end text-[13px] font-semibold text-primary-text">
                          Line total: {money(b.lineTotal)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Totals + payment */}
            {lines.length > 0 && (
              <div className="mb-6 rounded-lg bg-surface p-4 shadow-sm">
                <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">Payment</h2>

                <div className="mb-4 flex flex-col gap-1 text-[13px]">
                  <div className="flex justify-between"><span className="text-muted">Subtotal (post-discount)</span><span>{money(subtotal)}</span></div>
                  {totalDiscount > 0 && (
                    <div className="flex justify-between"><span className="text-muted">Total discount applied</span><span>{money(totalDiscount)}</span></div>
                  )}
                  {interstate ? (
                    <div className="flex justify-between"><span className="text-muted">IGST (3%)</span><span>{money(totalSgst + totalCgst)}</span></div>
                  ) : (
                    <>
                      <div className="flex justify-between"><span className="text-muted">SGST (1.5%)</span><span>{money(totalSgst)}</span></div>
                      <div className="flex justify-between"><span className="text-muted">CGST (1.5%)</span><span>{money(totalCgst)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between border-t border-divider pt-1 text-[16px] font-bold text-primary-text">
                    <span>Grand Total</span><span>{money(grandTotal)}</span>
                  </div>
                </div>

                <label className={labelCls}>Split payment</label>
                <div className="flex flex-col gap-2">
                  {payments.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        value={p.method}
                        onChange={(e) => updatePayment(i, "method", e.target.value)}
                        className={inputCls + " max-w-[140px]"}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={p.amount}
                        onChange={(e) => updatePayment(i, "amount", e.target.value)}
                        placeholder="Amount"
                        className={inputCls}
                      />
                      {payments.length > 1 && (
                        <button type="button" onClick={() => removePaymentLine(i)} className="rounded-md border border-border px-3 text-[12px] text-muted">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addPaymentLine} className="mt-2 text-[12px] font-medium text-primary-text underline">
                  + Add another payment method
                </button>

                {paymentsMismatch && payments.some((p) => p.amount) && (
                  <div className="mt-3 text-[12px] text-danger-text">
                    Payments total {money(paymentsTotal)} — doesn&apos;t match grand total {money(grandTotal)}.
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="mt-4 w-full rounded-md bg-primary px-4 py-3 text-[15px] font-bold text-white disabled:opacity-60"
                >
                  {finalizing ? "Finalizing…" : "Finalize & Print Invoice"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
