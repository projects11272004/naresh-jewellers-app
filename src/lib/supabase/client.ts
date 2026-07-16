import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Supabase client for use inside Client Components (runs in the browser).
// Session is stored in cookies (via @supabase/ssr) so the server can read it too.
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Copy .env.example to .env.local and fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
