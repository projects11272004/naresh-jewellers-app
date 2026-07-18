"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CategoryRow, ItemRow, ItemStatus, Purity } from "@/types/database";
import { printTag, type TagData } from "@/lib/tagPrint";

const PURITIES: Purity[] = ["24K", "22K", "18K", "14K", "Silver"];
const STATUSES: ItemStatus[] = ["in_stock", "sold", "transferred", "written_off"];

const BLANK_FIELDS = {
  categoryId: "" as string, // category id as string for the <select>
  itemName: "",
  huid: "",
  purity: "24K" as Purity,
  grossWeight: "",
  netWeight: "",
  hasStone: false,
  stoneType: "",
  stonePieces: "",
  stoneWeight: "",
  stoneCharges: "",
  hasPolish: false,
  polishPct: "",
  makingChargePerGram: "",
  hsnCode: "",
  sacCode: "",
  status: "in_stock" as ItemStatus,
};

// Shared by both entry points into "edit mode": scanning a barcode, and
// clicking Edit directly on a row in InventoryTable.
function mapItemToFields(item: ItemRow): typeof BLANK_FIELDS {
  return {
    categoryId: item.category_id?.toString() ?? "",
    itemName: item.item_name ?? "",
    huid: item.huid ?? "",
    purity: item.purity ?? "24K",
    grossWeight: item.gross_weight?.toString() ?? "",
    netWeight: item.net_weight?.toString() ?? "",
    hasStone: item.has_stone,
    stoneType: item.stone_type ?? "",
    stonePieces: item.stone_pieces?.toString() ?? "",
    stoneWeight: item.stone_weight ? item.stone_weight.toString() : "",
    stoneCharges: item.stone_charges ? item.stone_charges.toString() : "",
    hasPolish: item.has_polish,
    polishPct: item.polish_pct?.toString() ?? "",
    makingChargePerGram: item.making_charge_per_gram?.toString() ?? "",
    hsnCode: item.hsn_code ?? "",
    sacCode: item.sac_code ?? "",
    status: item.status,
  };
}

const inputCls =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-[14px] text-foreground outline-none focus:border-primary placeholder:text-faint";
const labelCls =
  "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted";

export default function ItemForm({
  userEmail,
  categories,
  onSaved,
  presetItem,
}: {
  userEmail: string;
  categories: CategoryRow[];
  onSaved: () => void;
  // When set (via the Edit button on an Inventory row), the form opens
  // straight into edit mode for this item - no barcode typing/scanning
  // needed. The parent (inventory/page.tsx) forces a remount with a
  // changing `key` whenever a new Edit is clicked, so these useState
  // initializers run fresh each time rather than needing a useEffect.
  presetItem?: ItemRow | null;
}) {
  const supabase = createClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [barcode, setBarcode] = useState(() => presetItem?.barcode ?? "");
  const [mode, setMode] = useState<"new" | "edit" | null>(() => (presetItem ? "edit" : null));
  const [itemId, setItemId] = useState<number | null>(() => presetItem?.id ?? null);
  const [fields, setFields] = useState(() => (presetItem ? mapItemToFields(presetItem) : BLANK_FIELDS));
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  // Kept after a save so staff can print the tag for the item just saved.
  const [lastSavedTag, setLastSavedTag] = useState<TagData | null>(null);

  const activeCategories = categories.filter((c) => c.active);

  function resetForm() {
    setBarcode("");
    setMode(null);
    setItemId(null);
    setFields(BLANK_FIELDS);
    barcodeInputRef.current?.focus();
  }

  // "New Item" — asks the database for the next NJxxxxx code and opens a
  // blank form with it. This is the normal way to add stock; the code it
  // returns is what gets printed on the tag.
  async function handleNewItem() {
    setBusy(true);
    setMessage(null);
    setLastSavedTag(null);
    const { data, error: err } = await supabase.rpc("generate_item_code", {} as never);
    setBusy(false);
    if (err || !data) {
      setMessage({ type: "error", text: `Could not generate item code: ${err?.message ?? "no code returned"}` });
      return;
    }
    setBarcode(String(data));
    setMode("new");
    setItemId(null);
    setFields(BLANK_FIELDS);
    setMessage({ type: "ok", text: `New item code ${data} — fill in the details and save.` });
  }

  // Scan an existing tag to open that item for editing.
  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;

    setBusy(true);
    setMessage(null);
    setLastSavedTag(null);

    const { data, error: err } = await supabase
      .from("items")
      .select("*")
      .eq("barcode", code)
      .returns<ItemRow[]>();

    setBusy(false);

    if (err) {
      setMessage({ type: "error", text: `Lookup failed: ${err.message}` });
      return;
    }

    const existing = data?.[0];
    if (existing) {
      setMode("edit");
      setItemId(existing.id);
      setFields(mapItemToFields(existing));
      setMessage({ type: "ok", text: `Found existing item — editing ${code}.` });
    } else {
      // Codes are generated by the portal, so an unknown scan is usually a
      // typo or an old/legacy tag. Still allow creating with it, but say so.
      setMode("new");
      setItemId(null);
      setFields(BLANK_FIELDS);
      setMessage({
        type: "ok",
        text: `No item found for ${code}. You can fill in details to create it with this code — or use "New Item" to auto-generate a fresh NJ code instead.`,
      });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;

    const netWeight = fields.netWeight ? Number(fields.netWeight) : null;
    if (netWeight != null && netWeight <= 0) {
      setMessage({ type: "error", text: "Net weight must be greater than 0." });
      return;
    }
    if (fields.hasPolish && fields.polishPct && Number(fields.polishPct) < 0) {
      setMessage({ type: "error", text: "Polish % cannot be negative." });
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
      category_id: fields.categoryId ? Number(fields.categoryId) : null,
      item_name: fields.itemName || null,
      huid: fields.huid || null,
      purity: fields.purity,
      gross_weight: fields.grossWeight ? Number(fields.grossWeight) : null,
      net_weight: netWeight,
      has_stone: fields.hasStone,
      // When "Stone: No", clear all stone fields so stale values never
      // linger on an item that no longer has a stone.
      stone_type: fields.hasStone ? fields.stoneType || null : null,
      stone_pieces: fields.hasStone && fields.stonePieces ? Number(fields.stonePieces) : null,
      stone_weight: fields.hasStone && fields.stoneWeight ? Number(fields.stoneWeight) : 0,
      stone_charges: fields.hasStone && fields.stoneCharges ? Number(fields.stoneCharges) : 0,
      has_polish: fields.hasPolish,
      polish_pct: fields.hasPolish && fields.polishPct ? Number(fields.polishPct) : null,
      making_charge_per_gram: fields.makingChargePerGram ? Number(fields.makingChargePerGram) : null,
      hsn_code: fields.hsnCode || null,
      sac_code: fields.sacCode || null,
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
    const savedCode = barcode.trim();
    setMessage({ type: "ok", text: `Saved ${savedCode}.` });
    setLastSavedTag({
      barcode: savedCode,
      grossWeight: payload.gross_weight,
      netWeight: payload.net_weight,
      stonePieces: payload.stone_pieces,
    });
    onSaved();
    resetForm();
  }

  function updateField<K extends keyof typeof BLANK_FIELDS>(key: K, value: (typeof BLANK_FIELDS)[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mb-6 rounded-lg bg-surface p-4 shadow-sm">
      <form onSubmit={handleScan} className="mb-4 flex items-end gap-3">
        <div className="flex-1">
          <label className={labelCls}>Scan tag to edit an existing item</label>
          <input
            ref={barcodeInputRef}
            autoFocus
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan tag or type code (e.g. NJ00001), then Enter"
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !barcode.trim()}
          className="rounded-md bg-secondary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
        >
          {busy ? "Working…" : "Find"}
        </button>
        <button
          type="button"
          onClick={handleNewItem}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
        >
          + New Item
        </button>
      </form>

      {message && (
        <div
          className={`mb-3 flex items-center gap-3 text-[13px] ${message.type === "ok" ? "text-success-text" : "text-danger-text"}`}
        >
          <span>{message.text}</span>
          {lastSavedTag && (
            <button
              type="button"
              onClick={() => printTag(lastSavedTag)}
              className="rounded-md border border-primary px-3 py-1 text-[12px] font-medium text-primary-text"
            >
              Print tag {lastSavedTag.barcode}
            </button>
          )}
        </div>
      )}

      {mode && (
        <form onSubmit={handleSave} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <div>
            <label className={labelCls}>Category</label>
            <select
              value={fields.categoryId}
              onChange={(e) => updateField("categoryId", e.target.value)}
              className={inputCls}
            >
              <option value="">— Select —</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Item name</label>
            <input
              value={fields.itemName}
              onChange={(e) => updateField("itemName", e.target.value)}
              placeholder="e.g. Ring, Chain"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>HUID</label>
            <input
              value={fields.huid}
              onChange={(e) => updateField("huid", e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Purity</label>
            <select
              value={fields.purity}
              onChange={(e) => updateField("purity", e.target.value as Purity)}
              className={inputCls}
            >
              {PURITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Gross weight (g)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={fields.grossWeight}
              onChange={(e) => updateField("grossWeight", e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Net weight (g)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={fields.netWeight}
              onChange={(e) => updateField("netWeight", e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Making charge (₹ per gram)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fields.makingChargePerGram}
              onChange={(e) => updateField("makingChargePerGram", e.target.value)}
              placeholder="₹ per gram"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>HSN code</label>
            <input
              value={fields.hsnCode}
              onChange={(e) => updateField("hsnCode", e.target.value)}
              placeholder="e.g. 7113 (material)"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>SAC code</label>
            <input
              value={fields.sacCode}
              onChange={(e) => updateField("sacCode", e.target.value)}
              placeholder="e.g. 998892 (making charge)"
              className={inputCls}
            />
          </div>

          {/* ---- Stone section: fields only appear when Stone = Yes ---- */}
          <div>
            <label className={labelCls}>Stone</label>
            <select
              value={fields.hasStone ? "yes" : "no"}
              onChange={(e) => updateField("hasStone", e.target.value === "yes")}
              className={inputCls}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          {fields.hasStone && (
            <>
              <div>
                <label className={labelCls}>Stone type</label>
                <input
                  value={fields.stoneType}
                  onChange={(e) => updateField("stoneType", e.target.value)}
                  placeholder="e.g. Diamond, Ruby"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Stone pieces</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={fields.stonePieces}
                  onChange={(e) => updateField("stonePieces", e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Stone weight (g)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={fields.stoneWeight}
                  onChange={(e) => updateField("stoneWeight", e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Stone charges (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fields.stoneCharges}
                  onChange={(e) => updateField("stoneCharges", e.target.value)}
                  className={inputCls}
                />
              </div>
            </>
          )}

          {/* ---- Polish section: % only appears when Polish = Yes ---- */}
          <div>
            <label className={labelCls}>Polish</label>
            <select
              value={fields.hasPolish ? "yes" : "no"}
              onChange={(e) => updateField("hasPolish", e.target.value === "yes")}
              className={inputCls}
            >
              <option value="no">Without polish</option>
              <option value="yes">With polish</option>
            </select>
          </div>

          {fields.hasPolish && (
            <div>
              <label className={labelCls}>Polish (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={fields.polishPct}
                onChange={(e) => updateField("polishPct", e.target.value)}
                placeholder="e.g. 8"
                className={inputCls}
              />
            </div>
          )}

          {mode === "edit" && (
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={fields.status}
                onChange={(e) => updateField("status", e.target.value as ItemStatus)}
                className={inputCls}
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
              className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Saving…" : mode === "new" ? "Save new item" : "Save changes"}
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
    </div>
  );
}
