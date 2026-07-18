import type { RateLogRow } from "@/types/database";
import { formatINR, formatDateTime } from "@/lib/format";

export default function RateHistoryTable({ rows }: { rows: RateLogRow[] }) {
  if (!rows.length) {
    return (
      <table className="w-full overflow-hidden rounded-lg bg-surface shadow-sm">
        <tbody>
          <tr>
            <td className="px-3.5 py-2.5 text-[13px] text-foreground">No history yet.</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="w-full overflow-hidden rounded-lg bg-surface shadow-sm">
      <thead>
        <tr className="bg-primary text-white">
          <th className="px-3.5 py-2.5 text-left text-xs">Purity</th>
          <th className="px-3.5 py-2.5 text-left text-xs">Rate / gram (INR)</th>
          <th className="px-3.5 py-2.5 text-left text-xs">Updated On</th>
          <th className="px-3.5 py-2.5 text-left text-xs">Updated By</th>
          <th className="px-3.5 py-2.5 text-left text-xs">Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const isAuto = row.source === "Auto-Sync API";
          return (
            <tr key={`${row.id}-${i}`} className="even:bg-row-hover">
              <td className="border-b border-divider-light px-3.5 py-2.5 text-[13px] text-foreground">
                {row.purity}
              </td>
              <td className="border-b border-divider-light px-3.5 py-2.5 text-[13px] text-foreground">
                {formatINR(row.rate_per_gram)}
              </td>
              <td className="border-b border-divider-light px-3.5 py-2.5 text-[13px] text-foreground">
                {formatDateTime(row.updated_on)}
              </td>
              <td className="border-b border-divider-light px-3.5 py-2.5 text-[13px] text-foreground">
                {row.updated_by ?? ""}
              </td>
              <td className="border-b border-divider-light px-3.5 py-2.5 text-[13px]">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    isAuto
                      ? "bg-success-bg text-success-text"
                      : "bg-warning-bg text-warning-text"
                  }`}
                >
                  {row.source}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
