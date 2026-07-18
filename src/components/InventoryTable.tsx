"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CategoryRow, CurrentRateRow, ItemRow, UserRole } from "@/types/database";
import { calculateItemPrice } from "@/lib/pricing";
import { formatINR, formatDateTime } from "@/lib/format";
import { printTag } from "@/lib/tagPrint";

const STATUS_STYLE: Record<string, string> = {
  in_stock: "bg-success-bg text-success-text",
  sold: "bg-info-bg text-info-text",
  transferred: "bg-warning-bg text-warning-text",
  written_off: "bg-danger-bg text-danger-text",
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
      <div className="rounded-lg bg-surface p-6 text-[13px] text-muted shadow-sm">
        No items yet. Click &ldquo;+ New Item&rdquo; above to add the first one.
      </div>
    );
  }

  return (
    <div>
      {error && <div className="mb-3 text-[13px] text-danger-text">{error}</div>}
      <div className="overflow-x-auto rounded-lg bg-surface shadow-sm">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-divider text-[11px] uppercase tracking-wide text-muted">
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
                <tr key={item.id} className="border-b border-divider-light last:border-0">
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
                  <td className="px-4 py-3 font-medium text-primary-text">
                    {price ? formatINR(price.total) : "Incomplete"}
                  </td>
                  <td className="px-4 py-3 text-faint">{formatDateTime(item.updated_at)}</td>
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
                        className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted hover:border-primary hover:text-primary-text"
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
                        className="rounded-md border border-danger-border px-2 py-1 text-[11px] font-medium text-danger-text hover:bg-danger-bg disabled:opacity-60"
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
