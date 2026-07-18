"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CategoryRow, CurrentRateRow, ItemRow, UserRole } from "@/types/database";
import { calculateItemPrice } from "@/lib/pricing";
import { formatINR, formatDateTime } from "@/lib/format";
import { printTag } from "@/lib/tagPrint";

const STATUS_STYLE: Record<string, string> = {
  in_stock: "bg-[#E7F4EC] text-[#1E7145]",
  sold: "bg-[#E9EDF5] text-[#1F3864]",
  transferred: "bg-[#FFF3CD] text-[#8A6D00]",
  written_off: "bg-[#FBE7E5] text-[#B42318]",
};

export default function InventoryTable({
  items,
  rates,
  categories,
  canEdit,
  userRole,
  onDeleted,
}: {
  items: ItemRow[];
  rates: CurrentRateRow[];
  categories: CategoryRow[];
  canEdit: boolean;
  userRole: UserRole | null;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const isAdmin = userRole === "admin";
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rateByPurity = new Map(rates.map((r) => [r.purity, r.rate_per_gram]));
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

  async function handleDelete(item: ItemRow) {
    const confirmed = window.confirm(
      `Delete ${item.barcode}${item.item_name ? ` (${item.item_name})` : ""}? ` +
        `This permanently removes the item AND its full history (stock log). ` +
        `This cannot be undone.\n\nIf you just want to mark it sold or moved, ` +
        `use the item form's Status field instead of deleting.`
    );
    if (!confirmed) return;

    setError(null);
    setDeletingId(item.id);
    const { error: deleteErr } = await supabase.from("items").delete().eq("id", item.id);
    setDeletingId(null);

    if (deleteErr) {
      setError(`Could not delete ${item.barcode}: ${deleteErr.message}`);
      return;
    }
    onDeleted();
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 text-[13px] text-[#5B6472] shadow-sm">
        No items yet. Click &ldquo;+ New Item&rdquo; above to add the first one.
      </div>
    );
  }

  return (
    <div>
      {error && <div className="mb-3 text-[13px] text-[#B42318]">{error}</div>}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#E3E5E8] text-[11px] uppercase tracking-wide text-[#5B6472]">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Purity</th>
              <th className="px-4 py-3">Net wt (g)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Selling price</th>
              <th className="px-4 py-3">Updated</th>
              {canEdit && <th className="px-4 py-3">Tag</th>}
              {isAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const rate = item.purity ? (rateByPurity.get(item.purity) ?? null) : null;
              const price = calculateItemPrice(item, rate);
              return (
                <tr key={item.id} className="border-b border-[#F0F1F3] last:border-0">
                  <td className="px-4 py-3 font-mono text-[12px]">{item.barcode}</td>
                  <td className="px-4 py-3">
                    {item.category_id != null ? (categoryById.get(item.category_id) ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-3">{item.item_name || "—"}</td>
                  <td className="px-4 py-3">{item.purity ?? "—"}</td>
                  <td className="px-4 py-3">{item.net_weight ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        STATUS_STYLE[item.status] ?? ""
                      }`}
                    >
                      {item.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#1F3864]">
                    {price ? formatINR(price.total) : "Incomplete"}
                  </td>
                  <td className="px-4 py-3 text-[#9AA0A6]">{formatDateTime(item.updated_at)}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          printTag({
                            barcode: item.barcode,
                            grossWeight: item.gross_weight,
                            netWeight: item.net_weight,
                            stonePieces: item.has_stone ? item.stone_pieces : null,
                          })
                        }
                        className="rounded-md border border-[#D9DCE1] px-2 py-1 text-[11px] font-medium text-[#5B6472] hover:border-[#1F3864] hover:text-[#1F3864]"
                      >
                        Print
                      </button>
                    </td>
                  )}
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        className="rounded-md border border-[#F3B4AC] px-2 py-1 text-[11px] font-medium text-[#B42318] hover:bg-[#FBE7E5] disabled:opacity-60"
                      >
                        {deletingId === item.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
