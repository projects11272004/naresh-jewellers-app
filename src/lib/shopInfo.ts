// Naresh Jewellers' official business details, as printed on the physical
// invoice book (GSTIN, address, bank details, jurisdiction clause). Used on
// the printed Tax Invoice so it carries the same legal information the shop
// already uses today. If any of these ever change (new GSTIN, moved bank
// account, etc.) this is the only place to update.

export const SHOP = {
  name: "M/S. NARESH JEWELLERS",
  tagline: "DEALS IN: ALL KINDS OF GOLD, DIAMOND & SILVER ORNAMENTS",
  addressLine: "Main Bazar, Near Central Bank of India, Sujanpur - 145023 (Pb.)",
  phone: "99885-35454",
  email: "nareshjewsjp@gmail.com",
  gstin: "03ALUPK6297L1ZA",
  state: "Punjab",
  stateCode: "03",
  bank: {
    name: "HDFC Bank, Satyam Palace Branch, Sujanpur",
    accountNo: "50200009842828",
    ifsc: "HDFC0003030",
  },
  jurisdiction: "All Disputes subject to Pathankot Jurisdiction",
} as const;

/**
 * Whether a sale is intra-state (CGST+SGST) or inter-state (IGST), based on
 * comparing the customer's state to the shop's home state. Case/whitespace
 * insensitive. A missing customer state defaults to intra-state (the
 * common case - local walk-in customers) rather than blocking the sale;
 * staff should still be encouraged to fill in State for out-of-state buyers.
 */
export function isInterstateSale(customerState: string | null | undefined): boolean {
  if (!customerState || !customerState.trim()) return false;
  return customerState.trim().toLowerCase() !== SHOP.state.toLowerCase();
}
