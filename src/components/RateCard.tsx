import type { CurrentRateRow } from "@/types/database";
import { formatINR, formatDateTime } from "@/lib/format";

const ACCENT: Record<string, string> = {
  "24K": "border-l-[#C9A227]",
  "22K": "border-l-[#C9A227]",
  "18K": "border-l-[#C9A227]",
  "14K": "border-l-[#C9A227]",
  Silver: "border-l-[#5B6472]",
};

export default function RateCard({ row }: { row: CurrentRateRow }) {
  const accent = ACCENT[row.purity] ?? "border-l-[#1F3864]";
  const perTenGrams = row.rate_per_gram * 10;
  return (
    <div className={`rounded-lg border-l-4 bg-white px-5 py-4 shadow-sm ${accent}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#5B6472]">
        {row.purity}
      </div>
      <div className="my-2 text-[28px] font-bold text-[#1F3864]">
        {formatINR(perTenGrams)}
        <span className="ml-1 text-[13px] font-medium text-[#9AA0A6]">/10g</span>
      </div>
      <div className="text-[11px] text-[#9AA0A6]">
        {formatINR(row.rate_per_gram)}/gram &middot; Updated {formatDateTime(row.updated_on)}
      </div>
    </div>
  );
}
