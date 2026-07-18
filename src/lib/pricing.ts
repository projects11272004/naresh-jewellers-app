import type { ItemRow } from "@/types/database";

// Shared selling-price calculation - used by the Inventory list, and now
// also the basis for Billing (Stage 2) line items, so the two never drift
// apart.
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
 *
 * Unchanged from before Stage 1 - Inventory's displayed price is untouched.
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

// ---------------------------------------------------------------------------
// Invoice line breakdown (Stage 1 addition, used starting Stage 2's Billing
// page). Presents the SAME total as calculateItemPrice() above - it does
// NOT change how much anything costs - but splits Material charges (gold
// value + stone charges) and Labour charges (making charge) into separate
// figures with their own SGST/CGST, matching the reference Tanishq invoice
// layout the client asked to match. Because both categories are taxed at
// the same 1.5%+1.5% rate, splitting vs combining produces an identical
// grand total - this is a presentation change only.
//
// Per-line discount fields are included (materialDiscount / stoneDiscount /
// labourDiscount) because the client confirmed discounts should be printed,
// itemized by category like Tanishq's. They default to 0 and are applied
// BEFORE tax, matching the reference invoice's "Less Discount on X Charges"
// appearing above the tax lines.
// ---------------------------------------------------------------------------

export interface InvoiceLineBreakdown {
  billingWeight: number;
  goldValue: number;
  stoneCharges: number;
  makingChargeAmount: number;

  materialDiscount: number;
  stoneDiscount: number;
  labourDiscount: number;

  materialTaxableAmount: number; // (goldValue + stoneCharges) minus material+stone discounts
  labourTaxableAmount: number; // makingChargeAmount minus labour discount

  materialSgst: number;
  materialCgst: number;
  labourSgst: number;
  labourCgst: number;

  lineTotal: number; // materialTaxableAmount + labourTaxableAmount + all four tax figures above
}

export function calculateInvoiceLineBreakdown(
  item: Pick<
    ItemRow,
    "net_weight" | "has_polish" | "polish_pct" | "making_charge_per_gram" | "stone_charges"
  >,
  ratePerGram: number | null,
  discounts: { materialDiscount?: number; stoneDiscount?: number; labourDiscount?: number } = {}
): InvoiceLineBreakdown | null {
  const base = calculateItemPrice(item, ratePerGram);
  if (!base) return null;

  const materialDiscount = discounts.materialDiscount ?? 0;
  const stoneDiscount = discounts.stoneDiscount ?? 0;
  const labourDiscount = discounts.labourDiscount ?? 0;

  const materialTaxableAmount = Math.max(
    0,
    base.goldValue + base.stoneCharges - materialDiscount - stoneDiscount
  );
  const labourTaxableAmount = Math.max(0, base.makingChargeAmount - labourDiscount);

  const materialSgst = materialTaxableAmount * SGST_RATE;
  const materialCgst = materialTaxableAmount * CGST_RATE;
  const labourSgst = labourTaxableAmount * SGST_RATE;
  const labourCgst = labourTaxableAmount * CGST_RATE;

  const lineTotal =
    materialTaxableAmount + labourTaxableAmount + materialSgst + materialCgst + labourSgst + labourCgst;

  return {
    billingWeight: base.billingWeight,
    goldValue: base.goldValue,
    stoneCharges: base.stoneCharges,
    makingChargeAmount: base.makingChargeAmount,
    materialDiscount,
    stoneDiscount,
    labourDiscount,
    materialTaxableAmount,
    labourTaxableAmount,
    materialSgst,
    materialCgst,
    labourSgst,
    labourCgst,
    lineTotal,
  };
}
