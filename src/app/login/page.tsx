"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-[#F5F6F8] px-6">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[20px] font-bold text-[#1F3864]">Naresh Jewellers</h1>
          <div className="mt-1 text-[13px] text-[#5B6472]">Sign in to continue</div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-[#5B6472]">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-[12px] font-medium text-[#5B6472]">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[#D9DCE1] px-3 py-2 text-[14px] outline-none focus:border-[#1F3864]"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="text-[13px] text-[#B42318]">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-[#1F3864] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center text-[12px] text-[#9AA0A6]">
          Don&apos;t have an account? Ask your admin to create one for you.
        </div>
      </div>
    </div>
  );
}
