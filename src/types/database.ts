// Hand-written types mirroring the Supabase schema (see /supabase/schema.sql).
// If the schema changes, update these to match — or later swap in
// `npx supabase gen types typescript` once the Supabase CLI is set up.

export type Purity = "24K" | "22K" | "18K" | "14K" | "Silver";
export type RateSource = "Manual" | "Auto-Sync API";

export interface CurrentRateRow {
  purity: Purity;
  rate_per_gram: number;
  updated_on: string; // ISO timestamp
  updated_by: string | null;
  source: RateSource;
}

export interface RateLogRow {
  id: number;
  purity: Purity;
  rate_per_gram: number;
  updated_on: string;
  updated_by: string | null;
  source: RateSource;
}

export interface SettingsRow {
  id: number;
  gold_margin_pct: number;
  silver_margin_pct: number;
  alert_email: string | null;
  last_sync_status: string | null;
  last_sync_time: string | null;
}

export type UserRole = "admin" | "employee";

export interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

// Add new keys here as future phases need them (and a checkbox row in
// GRANTABLE_PERMISSIONS on /team, and has_permission('the:key') in RLS).
// NOTE: voiding an invoice and deleting an item are deliberately NOT
// grantable permissions - both stay admin-only via is_admin() directly
// (see migrations 007 and the Stage 2 invoices migration), so they can
// never be handed to an employee through /team.
export type PermissionKey = "inventory:edit" | "categories:edit" | "billing:create";

export interface PermissionRow {
  user_id: string;
  permission: PermissionKey;
  granted_at: string;
  granted_by: string | null;
}

export type ItemStatus = "in_stock" | "sold" | "transferred" | "written_off";

export interface CategoryRow {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface ItemRow {
  id: number;
  barcode: string; // shop item code, e.g. NJ00001 — also what the printed barcode encodes
  huid: string | null;
  item_name: string | null;
  category_id: number | null;
  purity: Purity | null;
  gross_weight: number | null;
  net_weight: number | null;
  has_stone: boolean;
  stone_type: string | null;
  stone_pieces: number | null;
  stone_weight: number;
  stone_charges: number;
  has_polish: boolean;
  polish_pct: number | null; // billing weight = net_weight × (1 + polish_pct/100)
  making_charge_per_gram: number | null; // making charges are per-gram only
  hsn_code: string | null; // tax classification for the material/goods
  sac_code: string | null; // tax classification for the making-charge service
  status: ItemStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type StockLogAction = "created" | "updated" | "sold" | "transferred" | "written_off" | "restocked";

export interface StockLogRow {
  id: number;
  item_id: number;
  action: StockLogAction;
  note: string | null;
  changed_at: string;
  changed_by: string | null;
}

export interface CustomerRow {
  id: number;
  name: string;
  mobile: string;
  whatsapp_number: string | null;
  whatsapp_same_as_mobile: boolean;
  date_of_birth: string | null; // date
  anniversary: string | null; // date
  address: string | null;
  state: string | null; // decides CGST+SGST vs IGST at billing time
  jewellery_preference: string | null;
  ring_size: string | null;
  total_lifetime_purchase: number; // maintained by Billing (Stage 2), not computed here
  outstanding_balance: number;
  last_purchase_at: string | null;
  tags: string[]; // freeform, manually assigned (e.g. "VIP") - separate from the auto-computed segment
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type PaymentMethod = "Cash" | "Card" | "UPI" | "Cheque" | "Other";

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

export type InvoiceStatus = "completed" | "void";

export interface InvoiceRow {
  id: number;
  invoice_number: string; // e.g. NJ/2026-27/00001
  financial_year: string;
  sequence_in_year: number;
  customer_id: number;
  customer_state_at_billing: string | null;
  is_interstate: boolean;
  subtotal: number;
  total_discount: number;
  total_sgst: number;
  total_cgst: number;
  grand_total: number;
  payments: PaymentLine[];
  status: InvoiceStatus;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface InvoiceItemRow {
  id: number;
  invoice_id: number;
  item_id: number | null;
  barcode: string;
  description: string | null;
  hsn_code: string | null;
  sac_code: string | null;
  purity: string | null;
  net_weight: number | null;
  billing_weight: number | null;
  rate_per_gram: number;
  gold_value: number;
  stone_charges: number;
  making_charge_amount: number;
  material_discount: number;
  stone_discount: number;
  labour_discount: number;
  material_taxable_amount: number;
  labour_taxable_amount: number;
  material_sgst: number;
  material_cgst: number;
  labour_sgst: number;
  labour_cgst: number;
  line_total: number;
}

export interface Database {
  public: {
    Tables: {
      current_rates: { Row: CurrentRateRow; Insert: Partial<CurrentRateRow>; Update: Partial<CurrentRateRow>; Relationships: []; };
      rate_log: { Row: RateLogRow; Insert: Partial<RateLogRow>; Update: Partial<RateLogRow>; Relationships: []; };
      settings: { Row: SettingsRow; Insert: Partial<SettingsRow>; Update: Partial<SettingsRow>; Relationships: []; };
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow>; Relationships: []; };
      permissions: { Row: PermissionRow; Insert: Partial<PermissionRow>; Update: Partial<PermissionRow>; Relationships: []; };
      categories: { Row: CategoryRow; Insert: Partial<CategoryRow>; Update: Partial<CategoryRow>; Relationships: []; };
      items: { Row: ItemRow; Insert: Partial<ItemRow>; Update: Partial<ItemRow>; Relationships: []; };
      stock_log: { Row: StockLogRow; Insert: Partial<StockLogRow>; Update: Partial<StockLogRow>; Relationships: []; };
      customers: { Row: CustomerRow; Insert: Partial<CustomerRow>; Update: Partial<CustomerRow>; Relationships: []; };
      invoices: { Row: InvoiceRow; Insert: Partial<InvoiceRow>; Update: Partial<InvoiceRow>; Relationships: []; };
      invoice_items: { Row: InvoiceItemRow; Insert: Partial<InvoiceItemRow>; Update: Partial<InvoiceItemRow>; Relationships: []; };
    };
    Views: Record<string, never>;
    Functions: {
      has_permission: { Args: { check_permission: string }; Returns: boolean; };
      generate_item_code: { Args: Record<string, never>; Returns: string; };
      finalize_invoice: { Args: Record<string, never>; Returns: string; };
      void_invoice: { Args: Record<string, never>; Returns: undefined; };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
