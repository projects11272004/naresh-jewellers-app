// Naresh Jewellers — Gold/Silver Rate Auto-Sync (Supabase Edge Function)
// -----------------------------------------------------------------------
// Replaces the old Google Apps Script (RateSync.gs) now that Phase 1 lives on
// Supabase + Next.js. Same logic, same schema (rate_log append + current_rates
// upsert), just running as a scheduled server-side function instead of inside
// a spreadsheet.
//
// DEPLOY (one-time, from a machine with the Supabase CLI):
//   supabase functions deploy sync-rates --project-ref ntqeasbmmbjgdulygium
//   supabase secrets set GOLDAPI_KEY=your-goldapi-io-key --project-ref ntqeasbmmbjgdulygium
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into
// every Edge Function by the Supabase runtime — never set those manually and
// never put the service_role key in frontend code or this repo.
//
// SCHEDULE: set up a Postgres Cron job (Database > Cron in the Supabase
// dashboard, or the SQL below) to invoke this function once a day. See
// supabase/functions/sync-rates/cron.sql in this repo.

import { createClient } from "npm:@supabase/supabase-js@2";

const GOLD_URL = "https://www.goldapi.io/api/XAU/INR";
const SILVER_URL = "https://www.goldapi.io/api/XAG/INR";
const PURITIES = ["24K", "22K", "18K", "14K", "Silver"] as const;
type Purity = (typeof PURITIES)[number];

interface GoldApiResponse {
  price_gram_24k: number;
  price_gram_22k: number;
  price_gram_18k: number;
  price_gram_14k: number;
}

async function fetchMetal(url: string, apiKey: string): Promise<GoldApiResponse> {
  const resp = await fetch(url, { headers: { "x-access-token": apiKey } });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GoldAPI returned HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (typeof data?.price_gram_24k !== "number") {
    throw new Error(`Unexpected GoldAPI response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const goldApiKey = Deno.env.get("GOLDAPI_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Supabase runtime env vars" }), {
      status: 500,
    });
  }
  if (!goldApiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "GOLDAPI_KEY secret not set — run `supabase secrets set GOLDAPI_KEY=...`" }),
      { status: 500 }
    );
  }

  // service_role client — bypasses RLS, only ever runs server-side inside this function.
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: settings, error: settingsErr } = await supabase
      .from("settings")
      .select("gold_margin_pct, silver_margin_pct")
      .eq("id", 1)
      .single();
    if (settingsErr) throw new Error(`Could not read settings: ${settingsErr.message}`);

    // Gold and silver get separate margins because the gap between GoldAPI's raw
    // international spot price and the local India retail rate (import duty + GST +
    // dealer margin) differs meaningfully between the two metals — see
    // supabase/schema.sql for how these were calibrated against a local reference rate.
    const goldMargin = 1 + Number(settings?.gold_margin_pct ?? 0);
    const silverMargin = 1 + Number(settings?.silver_margin_pct ?? 0);

    const [gold, silver] = await Promise.all([
      fetchMetal(GOLD_URL, goldApiKey),
      fetchMetal(SILVER_URL, goldApiKey),
    ]);

    const rates: Record<Purity, number> = {
      "24K": round2(gold.price_gram_24k * goldMargin),
      "22K": round2(gold.price_gram_22k * goldMargin),
      "18K": round2(gold.price_gram_18k * goldMargin),
      "14K": round2(gold.price_gram_14k * goldMargin),
      Silver: round2(silver.price_gram_24k * silverMargin),
    };

    const now = new Date().toISOString();

    const logRows = PURITIES.map((purity) => ({
      purity,
      rate_per_gram: rates[purity],
      updated_on: now,
      updated_by: "GoldAPI Bot",
      source: "Auto-Sync API" as const,
    }));
    const { error: logErr } = await supabase.from("rate_log").insert(logRows);
    if (logErr) throw new Error(`Could not append to rate_log: ${logErr.message}`);

    const currentRows = logRows.map((row) => ({ ...row }));
    const { error: currentErr } = await supabase
      .from("current_rates")
      .upsert(currentRows, { onConflict: "purity" });
    if (currentErr) throw new Error(`Could not update current_rates: ${currentErr.message}`);

    await supabase
      .from("settings")
      .update({ last_sync_status: `OK — ${now}`, last_sync_time: now })
      .eq("id", 1);

    return new Response(JSON.stringify({ ok: true, rates, synced_at: now }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Yesterday's rates are left untouched — nothing gets appended/overwritten on failure.
    await supabase
      .from("settings")
      .update({
        last_sync_status: `FAILED — ${message}`,
        last_sync_time: new Date().toISOString(),
      })
      .eq("id", 1);

    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 });
  }
});
