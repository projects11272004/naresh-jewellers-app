# Naresh Jewellers — Showroom Management System: MVP Roadmap

Build strategy: ship one working phase at a time to a real, live URL. Each phase
goes live and gets used/tested by the client while the next phase is built —
nothing waits for a "big bang" launch. Later phases build on the data already
captured by earlier ones (see dependency notes below).

Stack: Next.js (App Router, TypeScript) + Tailwind CSS + Supabase (Postgres,
Auth, Storage, Edge Functions) + Vercel (hosting/CI-CD). Free tier on both
Supabase and Vercel for as long as usage stays under their limits.

## Phase 1 — Rate Master (current)
Status: in progress (frontend built, live deploy + automated sync pending).

- [x] Supabase project + schema (`current_rates`, `rate_log`, `settings`)
- [x] Next.js app scaffolded with typed Supabase client
- [x] Rate Master dashboard page (current rates + history table, auto-refresh)
- [x] Daily gold/silver rate auto-sync via Supabase Edge Function (replacing the
      Apps Script prototype) — GoldAPI.io fetch, writes to `rate_log` + updates
      `current_rates` in place (code + cron.sql done; still needs `supabase
      functions deploy` + secrets set once, from a machine with the CLI)
- [ ] Deploy live on Vercel with environment variables configured
- [ ] Client tests Phase 1 live while Phase 2 is built

## Phase 2 — Inventory
Depends on: Rate Master (pricing pulls live purity rates from `current_rates`).

- Item master: HUID, purity, gross/net weight, stone weight & charges, making
  charge (%, per-gram, or fixed), wastage %, barcode/tag
- Auto-computed selling price from live rate + making charge + wastage + GST
- Stock-in / stock-out ledger, branch-wise stock view

## Phase 3 — Billing / POS
Depends on: Inventory (line items pulled from stock), Rate Master (pricing).

- Invoice creation, GST-compliant billing, payment modes, print/PDF receipt
- Old gold exchange handling (valuation against live rate, deduction on bill)

## Phase 4 — Cash Book & Expenses
Depends on: Billing (cash sales feed the cash book).

- Daily cash/bank ledger, expense categories, day-end reconciliation

## Phase 5 — CRM + WhatsApp Automation
Depends on: Billing (purchase history per customer).

- Customer profiles, purchase history, birthday/anniversary reminders
- WhatsApp order/billing/reminder automation (Meta Business API + BSP)

## Phase 6 — Supplier / Karigar Ledger + Custom Orders & Repairs
Depends on: Inventory (raw stock received from suppliers/karigars).

- Purchase orders, supplier ledgers, karigar job cards & wastage tracking
- Custom order tracking, repair job status pipeline

## Phase 7 — Employee Management + Attendance
Independent of Phases 2–6, can be built in parallel once Phase 1 is stable.

- Role-based permissions, biometric attendance integration, payroll basics

## Phase 8 — Owner Dashboard, Multi-Branch, Stock Audit, Website Integration
Depends on: all prior phases (aggregates data across the whole system).

- Cross-branch KPIs, stock audit workflows, digital catalogue, website/API
  integration, owner mobile app

---

**Working agreement:** each phase ships to the same live app (new pages/routes
added incrementally), so the client is always testing something real, never a
mockup. Nothing here is fixed in stone — order can shift if the client's
priorities change, but dependencies above should be respected to avoid
rework.
