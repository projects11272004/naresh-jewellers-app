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
  created_at: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
