import type { ItemRow } from "@/types/database";

// Shared selling-price calculation - used by the Inventory list now, and will
// be reused by Billing in Phase 3 so the two never drift apart.
//
// Formula:
//   effective weight = net weight x (1 + wastage%)
//   gold value       = effective weight x live rate/gram (by purity)
//   making charge    = percentage -> % of gold value
//                      per_gram   -> net weight x value
//                      flat       -> value as-is
//   subtotal         = gold value + making charge + stone charges
//   SGST / CGST      = 1.5% each of subtotal
//   total             = subtotal + SGST + CGST

const SGST_RATE = 0.015;
const CGST_RATE = 0.015;

export interface PriceBreakdown {
  effectiveWeight: number;
  goldValue: number;
  makingChargeAmount: number;
  stoneCharges: number;
  subtotal: number;
  sgst: number;
  cgst: number;
  total: number;
}

/**
 * Returns null if the item is still a draft missing fields required to
 * price it (purity/net weight/making charge) - the Inventory list shows
 * "Incomplete" for these instead of a price.
 */
export function calculateItemPrice(
  item: Pick<
    ItemRow,
    | "net_weight"
    | "wastage_pct"
    | "making_charge_type"
    | "making_charge_value"
    | "stone_charges"
  >,
  ratePerGram: number | null
): PriceBreakdown | null {
  if (
    item.net_weight == null ||
    item.making_charge_type == null ||
    item.making_charge_value == null ||
    ratePerGram == null
  ) {
    return null;
  }

  const effectiveWeight = item.net_weight * (1 + (item.wastage_pct ?? 0) / 100);
  const goldValue = effectiveWeight * ratePerGram;

  let makingChargeAmount: number;
  switch (item.making_charge_type) {
    case "percentage":
      makingChargeAmount = goldValue * (item.making_charge_value / 100);
      break;
    case "per_gram":
      makingChargeAmount = item.net_weight * item.making_charge_value;
      break;
    case "flat":
    default:
      makingChargeAmount = item.making_charge_value;
      break;
  }

  const stoneCharges = item.stone_charges ?? 0;
  const subtotal = goldValue + makingChargeAmount + stoneCharges;
  const sgst = subtotal * SGST_RATE;
  const cgst = subtotal * CGST_RATE;
  const total = subtotal + sgst + cgst;

  return { effectiveWeight, goldValue, makingChargeAmount, stoneCharges, subtotal, sgst, cgst, total };
}
