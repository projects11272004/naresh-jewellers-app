import type { CustomerRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Auto-computed customer segment (VIP / Regular / New / Inactive /
// High-Value). This is deliberately NOT stored in the database (see
// migration 008) so these thresholds can be tuned freely with no migration.
//
// THE THRESHOLDS BELOW ARE PLACEHOLDERS. The client hasn't given us real
// numbers yet - these are reasonable defaults for a single showroom, not
// numbers confirmed with the buyer. Change the three constants below once
// real figures are agreed, nothing else needs to change.
//
// "VIP" is intentionally NOT one of the auto-computed segments - the client
// asked for manual tagging as a separate capability (the `tags` column), and
// VIP status in most jewellery shops is a relationship judgment call, not a
// number. Apply "VIP" as a tag by hand; it can coexist with any computed
// segment below.
// ---------------------------------------------------------------------------

const HIGH_VALUE_THRESHOLD_RUPEES = 500_000; // placeholder
const INACTIVE_AFTER_DAYS = 365; // placeholder
const NEW_CUSTOMER_WINDOW_DAYS = 30; // placeholder

export type ComputedSegment = "new" | "high_value" | "inactive" | "regular";

export const SEGMENT_LABEL: Record<ComputedSegment, string> = {
  new: "New",
  high_value: "High-Value",
  inactive: "Inactive",
  regular: "Regular",
};

export function computeSegment(customer: Pick<CustomerRow, "total_lifetime_purchase" | "last_purchase_at" | "created_at">): ComputedSegment {
  const now = Date.now();
  const daysSince = (iso: string) => (now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);

  const hasPurchased = customer.total_lifetime_purchase > 0 && customer.last_purchase_at != null;

  if (!hasPurchased) {
    // Never purchased: "New" while recently added, "Inactive" if they've
    // been a no-purchase profile for a long time (stale, not a fresh lead).
    return daysSince(customer.created_at) <= NEW_CUSTOMER_WINDOW_DAYS ? "new" : "inactive";
  }
  if (customer.total_lifetime_purchase >= HIGH_VALUE_THRESHOLD_RUPEES) {
    return "high_value";
  }
  if (customer.last_purchase_at && daysSince(customer.last_purchase_at) >= INACTIVE_AFTER_DAYS) {
    return "inactive";
  }
  return "regular";
}
