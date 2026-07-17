"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemRow, ItemStatus, MakingChargeType, Purity } from "@/types/database";

const PURITIES: Purity[] = ["24K", "22K", "18K", "14K", "Silver"];
const MAKING_CHARGE_TYPES: { value: MakingChargeType; label: string }[] = [
  { value: "percentage", label: "% of gold value" },
  { value: "per_gram", label: "Per gram" },
  { value: "flat", label: "Flat amount" },
];
const STATUSES: ItemStatus[] = ["in_stock", "sold", "transferred", "written_off"];

const BLANK_FIELDS = {
  huid: "",
  itemName: "",
  purity: "24K" as Purity,
  grossWeight: "",
  netWeight: "",
  stoneWeight: "",
  stoneCharges: "",
  makingChargeType: "percentage" as MakingChargeType,
  makingChargeValue: "",
  wastagePct: "",
  status: "in_stock" as ItemStatus,
};

export default function ItemForm({
  userEmail,
  onSaved,
}: {
  userEmail: string;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [barcode, setBarcode] = useState("");
  const [mode, setMode] = useState<"new" | "edit" | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [fields, setFields] = useState(BLANK_FIELDS);
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function resetForm() {
    setBarcode("");
    setMode(null);
    setItemId(null);
    setFields(BLANK_FIELDS);
    barcodeInputRef.current?.focus();
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;

    setLooking(true);
    setMessage(null);

    const { data, error: err } = await supabase
      .from("items")
      .select("*")
      .eq("barcode", code)
      .returns<ItemRow[]>();

    setLooking(false);

    if (err) {
      setMessage({ type: "error", text: `Lookup failed: ${err.message}` });
      return;
    }

    const existing = data?.[0];
    if (existing) {
      setMode("edit");
      setItemId(existing.id);
      setFields({
        huid: existing.huid ?? "",
        itemName: existing.item_name ?? "",
        purity: existing.purity ?? "24K",
        grossWeight: existing.gross_weight?.toString() ?? "",
        netWeight: existing.net_weight?.toString() ?? "",
        stoneWeight: existing.stone_weight?.toString() ?? "",
        stoneCharges: existing.stone_charges?.toString() ?? "",
        makingChargeType: existing.making_charge_type ?? "percentage",
        makingChargeValue: existing.making_charge_value?.toString() ?? "",
        wastagePct: existing.wastage_pct?.toString() ?? "",
        status: existing.status,
      });
      setMessage({ type: "ok", text: `Found existing item — editing barcode ${code}.` });
    } else {
      setMode("new");
      setItemId(null);
      setFields(BLANK_FIELDS);
      setMessage({ type: "ok", text: `New barcode — fill in the details below and save.` });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;

    const netWeight = fields.netWeight ? Number(fields.netWeight) : null;
    const makingChargeValue = fields.makingChargeValue ? Number(fields.makingChargeValue) : null;

    if (netWeight != null && netWeight <= 0) {
      setMessage({ type: "error", text: "Net weight must be greater than 0." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const now = new Date().toISOString();
    // See UpdateRateForm.tsx for why write payloads are cast `as never` - a
    // known rough edge with our hand-written Database type, not a runtime
    // safety issue (Postgres + the checks above still validate the data).
    const payload = {
      barcode: barcode.trim(),
      huid: fields.huid || null,
      item_name: fields.itemName || null,
      purity: fields.purity,
      gross_weight: fields.grossWeight ? Number(fields.grossWeight) : null,
      net_weight: netWeight,
      stone_weight: fields.stoneWeight ? Number(fields.stoneWeight) : 0,
      stone_charges: fields.stoneCharges ? Number(fields.stoneCharges) : 0,
      making_charge_type: fields.makingChargeType,
      making_charge_value: makingChargeValue,
      wastage_pct: fields.wastagePct ? Number(fields.wastagePct) : 0,
      status: fields.status,
      updated_at: now,
      updated_by: userEmail,
    };

    let savedItemId = itemId;
    let logAction: "created" | "updated" | "sold" | "transferred" | "written_off" = "updated";

    if (mode === "new") {
      const { data, error: insertErr } = await supabase
        .from("items")
        .insert({ ...payload, created_at: now, created_by: userEmail } as never)
        .select("id")
        .returns<{ id: number }[]>();

      if (insertErr) {
        setSubmitting(false);
        setMessage({ type: "error", text: `Could not save item: ${insertErr.message}` });
        return;
      }
      savedItemId = data?.[0]?.id ?? null;
      logAction = "created";
    } else if (itemId != null) {
      const { error: updateErr } = await supabase
        .from("items")
        .update(payload as never)
        .eq("id", itemId);

      if (updateErr) {
        setSubmitting(false);
        setMessage({ type: "error", text: `Could not save item: ${updateErr.message}` });
        return;
      }
      if (["sold", "transferred", "written_off"].includes(fields.status)) {
        logAction = fields.status as "sold" | "transferred" | "written_off";
      }
    }

    if (savedItemId != null) {
      await supabase.from("stock_log").insert({
        item_id: savedItemId,
        action: logAction,
        changed_at: now,
        changed_by: userEmail,
      } as never);
    }

    setSubmitting(false);
    setMessage({ type: "ok", text: `Saved barcode ${barcode.trim()}.` });
    onSaved();
    resetForm();
  }

  function updateField<K extends keyof typeof BLANK_FIELDS>(key: K, value: (typeof BLANK_FIELDS)[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
      <form onSubmit={handleScan} className="mb-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
            Scan or enter barcode
          </label>
          <input
            ref={barcodeInputRef}
            autoFocus
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan tag or type barcode, then Enter"
            className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
          />
        </div>
        <button
          type="submit"
          disabled={looking || !barcode.trim()}
          className="rounded-md bg-[#5B6472] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
        >
          {looking ? "Looking up…" : "Find"}
        </button>
      </form>

      {message && (
        <div
          className={`mb-3 text-[13px] ${message.type === "ok" ? "text-[#1E7145]" : "text-[#B42318]"}`}
        >
          {message.text}
        </div>
      )}

      {mode && (
        <form onSubmit={handleSave} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Item name
            </label>
            <input
              value={fields.itemName}
              onChange={(e) => updateField("itemName", e.target.value)}
              placeholder="e.g. Ring, Chain"
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              HUID
            </label>
            <input
              value={fields.huid}
              onChange={(e) => updateField("huid", e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Purity
            </label>
            <select
              value={fields.purity}
              onChange={(e) => updateField("purity", e.target.value as Purity)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            >
              {PURITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Gross weight (g)
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={fields.grossWeight}
              onChange={(e) => updateField("grossWeight", e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Net weight (g)
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={fields.netWeight}
              onChange={(e) => updateField("netWeight", e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Stone weight (g)
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={fields.stoneWeight}
              onChange={(e) => updateField("stoneWeight", e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Stone charges (₹)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fields.stoneCharges}
              onChange={(e) => updateField("stoneCharges", e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Wastage (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fields.wastagePct}
              onChange={(e) => updateField("wastagePct", e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Making charge type
            </label>
            <select
              value={fields.makingChargeType}
              onChange={(e) => updateField("makingChargeType", e.target.value as MakingChargeType)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            >
              {MAKING_CHARGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
              Making charge value
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fields.makingChargeValue}
              onChange={(e) => updateField("makingChargeValue", e.target.value)}
              placeholder={
                fields.makingChargeType === "percentage"
                  ? "e.g. 12 (%)"
                  : fields.makingChargeType === "per_gram"
                    ? "₹ per gram"
                    : "₹ flat"
              }
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
            />
          </div>

          {mode === "edit" && (
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
                Status
              </label>
              <select
                value={fields.status}
                onChange={(e) => updateField("status", e.target.value as ItemStatus)}
                className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="col-span-full flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#1F3864] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Saving…" : mode === "new" ? "Save new item" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-[#D9DCE1] px-4 py-2 text-[14px] font-medium text-[#5B6472]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
