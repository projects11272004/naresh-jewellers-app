import type { CurrentRateRow, ItemRow } from "@/types/database";
import { calculateItemPrice } from "@/lib/pricing";
import { formatINR, formatDateTime } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  in_stock: "bg-[#E7F4EC] text-[#1E7145]",
  sold: "bg-[#E9EDF5] text-[#1F3864]",
  transferred: "bg-[#FFF3CD] text-[#8A6D00]",
  written_off: "bg-[#FBE7E5] text-[#B42318]",
};

export default function InventoryTable({
  items,
  rates,
}: {
  items: ItemRow[];
  rates: CurrentRateRow[];
}) {
  const rateByPurity = new Map(rates.map((r) => [r.purity, r.rate_per_gram]));

  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 text-[13px] text-[#5B6472] shadow-sm">
        No items yet. Scan a barcode above to add the first one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#E3E5E8] text-[11px] uppercase tracking-wide text-[#5B6472]">
            <th className="px-4 py-3">Barcode</th>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Purity</th>
            <th className="px-4 py-3">Net wt (g)</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Selling price</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const rate = item.purity ? (rateByPurity.get(item.purity) ?? null) : null;
            const price = calculateItemPrice(item, rate);
            return (
              <tr key={item.id} className="border-b border-[#F0F1F3] last:border-0">
                <td className="px-4 py-3 font-mono text-[12px]">{item.barcode}</td>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
