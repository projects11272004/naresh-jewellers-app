// Deprecated: this single shared client predates auth. Now that every page
// requires a logged-in session (see proxy.ts + src/lib/supabase/), use:
//   - "@/lib/supabase/client" createClient() inside Client Components
//   - "@/lib/supabase/server" createClient() inside Server Components/Actions
// Kept only so this file doesn't silently disappear from git history — nothing
// in the app imports from here anymore.
export {};
