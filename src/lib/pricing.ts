import type { ItemRow } from "@/types/database";

// Shared selling-price calculation - used by the Inventory list now, and will
// be reused by Billing in Phase 3 so the two never drift apart.
//
// Formula (post-006 rework):
//   billing weight = net weight × (1 + polish% / 100)   [if item has polish]
//                  = net weight                          [if not]
//   gold value     = billing weight × live rate/gram (by purity)
//   making charge  = billing weight × per-gram making charge
//   subtotal       = gold value + making charge + stone charges
//   SGST / CGST    = 1.5% each of subtotal
//   total          = subtotal + SGST + CGST
//
// NOTE: making charge is applied to the BILLING (polished) weight, per the
// client's instruction that "whatever the weight becomes in the end, that is
// how we calculate the invoice". If the client ever clarifies that making
// charges should use plain net weight instead, flip this one constant:
const MAKING_CHARGE_ON_BILLING_WEIGHT = true;

const SGST_RATE = 0.015;
const CGST_RATE = 0.015;

export interface PriceBreakdown {
  billingWeight: number;
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
 * price it (purity/net weight/making charge, or polish% when has_polish) -
 * the Inventory list shows "Incomplete" for these instead of a price.
 */
export function calculateItemPrice(
  item: Pick<
    ItemRow,
    "net_weight" | "has_polish" | "polish_pct" | "making_charge_per_gram" | "stone_charges"
  >,
  ratePerGram: number | null
): PriceBreakdown | null {
  if (
    item.net_weight == null ||
    item.making_charge_per_gram == null ||
    ratePerGram == null ||
    (item.has_polish && item.polish_pct == null)
  ) {
    return null;
  }

  const polishPct = item.has_polish ? (item.polish_pct ?? 0) : 0;
  const billingWeight = item.net_weight * (1 + polishPct / 100);
  const goldValue = billingWeight * ratePerGram;

  const makingWeight = MAKING_CHARGE_ON_BILLING_WEIGHT ? billingWeight : item.net_weight;
  const makingChargeAmount = makingWeight * item.making_charge_per_gram;

  const stoneCharges = item.stone_charges ?? 0;
  const subtotal = goldValue + makingChargeAmount + stoneCharges;
  const sgst = subtotal * SGST_RATE;
  const cgst = subtotal * CGST_RATE;
  const total = subtotal + sgst + cgst;

  return { billingWeight, goldValue, makingChargeAmount, stoneCharges, subtotal, sgst, cgst, total };
}
