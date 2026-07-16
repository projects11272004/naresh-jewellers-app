// Superseded by middleware.ts at the project root — Next.js 16 renamed
// middleware.ts to proxy.ts, but route protection wasn't actually being
// enforced on Vercel with this file in place (verified: unauthenticated
// requests reached the app instead of redirecting to /login). Reverted to
// the older, proven middleware.ts convention, which Next.js still supports.
// This file is intentionally inert (no exported `proxy` function) so Next.js
// doesn't treat it as an active route boundary.
export {};
