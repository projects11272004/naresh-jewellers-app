import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// This runs in front of every matched request, before it reaches a page —
// refreshes the Supabase session and redirects unauthenticated visitors to
// /login (see src/lib/supabase/proxy.ts for the actual logic).
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico and common image extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
