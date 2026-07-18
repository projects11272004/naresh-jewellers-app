import type { CurrentRateRow } from "@/types/database";
import { formatINR, formatDateTime } from "@/lib/format";

const ACCENT: Record<string, string> = {
  "24K": "border-l-accent",
  "22K": "border-l-accent",
  "18K": "border-l-accent",
  "14K": "border-l-accent",
  Silver: "border-l-muted",
};

export default function RateCard({ row }: { row: CurrentRateRow }) {
  const accent = ACCENT[row.purity] ?? "border-l-primary";
  return (
    <div className={`rounded-lg border-l-4 bg-surface px-5 py-4 shadow-sm ${accent}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
        {row.purity}
      </div>
      <div className="my-2 text-[28px] font-bold text-primary-text">
        {formatINR(row.rate_per_gram)}
        <span className="ml-1 text-[13px] font-medium text-faint">/gram</span>
      </div>
      <div className="text-[11px] text-faint">
        Updated {formatDateTime(row.updated_on)}
      </div>
    </div>
  );
}
