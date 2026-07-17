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
  updated_on: string; // ISO timestamp
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
  id: string; // matches auth.users.id
  role: UserRole;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

// Every grantable, per-employee feature permission across the whole app.
// Add a new key here (and check it with has_permission() in RLS) whenever a
// future phase needs its own admin-grantable edit permission - no schema
// migration needed beyond the permissions table itself.
export type PermissionKey = "inventory:edit";

export interface PermissionRow {
  user_id: string;
  permission: PermissionKey;
  granted_at: string;
  granted_by: string | null;
}

// Phase 2: Inventory. Items are keyed by barcode (shop-assigned, not
// manufacturer barcodes) - scanning a known barcode loads the existing row,
// scanning an unknown one starts a blank draft with just the barcode filled.
// Most fields are nullable because a freshly-scanned draft may not have them
// yet; a row is only "priceable" once purity/net_weight/making charge are set
// (see src/lib/pricing.ts).
export type MakingChargeType = "percentage" | "per_gram" | "flat";
export type ItemStatus = "in_stock" | "sold" | "transferred" | "written_off";

export interface ItemRow {
  id: number;
  barcode: string;
  huid: string | null;
  item_name: string | null;
  purity: Purity | null;
  gross_weight: number | null;
  net_weight: number | null;
  stone_weight: number;
  stone_charges: number;
  making_charge_type: MakingChargeType | null;
  making_charge_value: number | null;
  wastage_pct: number;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type StockLogAction =
  | "created"
  | "updated"
  | "sold"
  | "transferred"
  | "written_off"
  | "restocked";

export interface StockLogRow {
  id: number;
  item_id: number;
  action: StockLogAction;
  note: string | null;
  changed_at: string;
  changed_by: string | null;
}

// Minimal Database shape for the supabase-js generic client typing, matching the
// structure produced by `supabase gen types typescript` (Row/Insert/Update/Relationships
// per table) so the postgrest-js generics resolve correctly instead of falling back to `never`.
// Only the tables/columns the frontend actually reads are declared here.
export interface Database {
  public: {
    Tables: {
      current_rates: {
        Row: CurrentRateRow;
        Insert: Partial<CurrentRateRow>;
        Update: Partial<CurrentRateRow>;
        Relationships: [];
      };
      rate_log: {
        Row: RateLogRow;
        Insert: Partial<RateLogRow>;
        Update: Partial<RateLogRow>;
        Relationships: [];
      };
      settings: {
        Row: SettingsRow;
        Insert: Partial<SettingsRow>;
        Update: Partial<SettingsRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      permissions: {
        Row: PermissionRow;
        Insert: Partial<PermissionRow>;
        Update: Partial<PermissionRow>;
        Relationships: [];
      };
      items: {
        Row: ItemRow;
        Insert: Partial<ItemRow>;
        Update: Partial<ItemRow>;
        Relationships: [];
      };
      stock_log: {
        Row: StockLogRow;
        Insert: Partial<StockLogRow>;
        Update: Partial<StockLogRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_permission: {
        Args: { check_permission: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
