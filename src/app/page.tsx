"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CurrentRateRow, RateLogRow, UserRole } from "@/types/database";
import Header from "@/components/Header";
import RateCard from "@/components/RateCard";
import RateHistoryTable from "@/components/RateHistoryTable";
import UpdateRateForm from "@/components/UpdateRateForm";
import { formatDateTime } from "@/lib/format";

const PURITY_ORDER = ["24K", "22K", "18K", "14K", "Silver"];
const REFRESH_INTERVAL_MS = 60_000;

export default function RateMasterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentRates, setCurrentRates] = useState<CurrentRateRow[]>([]);
  const [history, setHistory] = useState<RateLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const loadCurrentRates = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("current_rates")
      .select("*")
      .order("purity", { ascending: true })
      .returns<CurrentRateRow[]>();

    if (err) {
      setError("Could not load current rates: " + err.message);
      return;
    }

    const sorted = [...(data ?? [])].sort(
      (a, b) => PURITY_ORDER.indexOf(a.purity) - PURITY_ORDER.indexOf(b.purity)
    );
    setCurrentRates(sorted);
    setError(null);

    if (sorted.length) {
      const latest = sorted.reduce((a, b) =>
        new Date(a.updated_on) > new Date(b.updated_on) ? a : b
      );
      setLastSynced(latest.updated_on);
    }
  }, [supabase]);

  const loadHistory = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("rate_log")
      .select("*")
      .order("updated_on", { ascending: false })
      .limit(50)
      .returns<RateLogRow[]>();

    if (err) {
      setError("Could not load rate history: " + err.message);
      return;
    }
    setHistory(data ?? []);
  }, [supabase]);

  const loadUser = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;
    setUserEmail(user.email ?? null);

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .returns<{ role: UserRole }[]>();

    setUserRole(profileRows?.[0]?.role ?? "employee");
  }, [supabase]);

  useEffect(() => {
    async function initialLoad() {
      await Promise.all([loadCurrentRates(), loadHistory(), loadUser()]);
      setLoading(false);
    }
    initialLoad();

    const interval = setInterval(() => {
      loadCurrentRates();
      loadHistory();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadCurrentRates, loadHistory, loadUser]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-[#F5F6F8] text-[#1a1a1a]">
      <Header
        title="Naresh Jewellers"
        subtitle="Rate Master"
        statusText={lastSynced ? `Last synced: ${formatDateTime(lastSynced)}` : undefined}
        userEmail={userEmail ?? undefined}
        userRole={userRole ?? undefined}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8 pb-16">
        <section className="mb-10">
          <h2 className="mb-4 border-b-2 border-[#C9A227] pb-2 text-[15px] uppercase tracking-wide text-[#5B6472]">
            Current Rates
          </h2>

          {loading && (
            <div className="px-4 py-4 text-[13px] text-[#5B6472]">
              Loading current rates…
            </div>
          )}
          {error && (
            <div className="px-4 py-4 text-[13px] text-[#B42318]">{error}</div>
          )}

          {!loading && userRole === "admin" && userEmail && (
            <UpdateRateForm userEmail={userEmail} onUpdated={loadCurrentRates} />
          )}

          {!loading && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
              {currentRates.map((row) => (
                <RateCard key={row.purity} row={row} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 border-b-2 border-[#C9A227] pb-2 text-[15px] uppercase tracking-wide text-[#5B6472]">
            Rate History
          </h2>
          <RateHistoryTable rows={history} />
        </section>
      </main>
    </div>
  );
}
