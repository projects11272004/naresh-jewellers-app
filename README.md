# Naresh Jewellers — Showroom Management System

Phase 1 (Rate Master) of an incrementally-shipped showroom management system.
See `ROADMAP.md` for the full phase-by-phase MVP plan.

Stack: Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Postgres +
Edge Functions), deployed on Vercel.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

Open http://localhost:3000 to view the app.

Environment variables (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project's API URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon/public key (never the
  service_role key — that must stay server-side only, e.g. in a Supabase Edge
  Function's own secrets, never in this repo or in frontend env vars)

## Database schema

`supabase/schema.sql` contains the full Phase 1 schema (`rate_log`,
`current_rates`, `settings`) with Row Level Security policies. Run it in the
Supabase SQL Editor when setting up a new project.

## Project structure

```
src/
  app/            Next.js routes (App Router)
  components/     Reusable UI components (Header, RateCard, RateHistoryTable)
  lib/            Supabase client, formatting helpers
  types/          TypeScript types mirroring the database schema
supabase/
  schema.sql              Database schema (safe to commit — no secrets)
  functions/sync-rates/   Daily gold/silver rate auto-sync (Edge Function)
```

## Rate sync automation (Supabase Edge Function)

`supabase/functions/sync-rates/index.ts` replaces the old Google Apps Script —
it fetches gold/silver rates from GoldAPI.io, appends to `rate_log`, and
upserts `current_rates`, all server-side using the service_role key (which
Supabase injects automatically into every Edge Function — it is never stored
in this repo or in frontend env vars).

One-time deploy, from a machine with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref ntqeasbmmbjgdulygium
supabase functions deploy sync-rates
supabase secrets set GOLDAPI_KEY=your-goldapi-io-key
```

Then run `supabase/functions/sync-rates/cron.sql` once in the Supabase SQL
Editor to schedule it daily (see that file for the pg_cron setup and notes).
Test manually anytime with:

```bash
supabase functions invoke sync-rates
```

## Deployment

Deployed on Vercel. Set the two environment variables above in the Vercel
project settings (Project > Settings > Environment Variables) — do not commit
`.env.local`.
