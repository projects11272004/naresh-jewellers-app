"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Purity } from "@/types/database";

const PURITIES: Purity[] = ["24K", "22K", "18K", "14K", "Silver"];

export default function UpdateRateForm({
  userEmail,
  onUpdated,
}: {
  userEmail: string;
  onUpdated: () => void;
}) {
  const [purity, setPurity] = useState<Purity>("24K");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rateValue = Number(rate);
    if (!rateValue || rateValue <= 0) {
      setMessage({ type: "error", text: "Enter a valid rate greater than 0." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const supabase = createClient();
    const now = new Date().toISOString();

    // supabase-js's generic inference for .update()/.insert() payloads resolves to
    // `never` with our hand-written Database type (a known rough edge with manually
    // authored - vs CLI-generated - types). The `as never` cast below only affects
    // the TypeScript check; the object shape is still validated at runtime by
    // Postgres itself (and by rateValue > 0 above), so this doesn't weaken safety.
    const { error: currentErr } = await supabase
      .from("current_rates")
      .update({
        rate_per_gram: rateValue,
        updated_on: now,
        updated_by: userEmail,
        source: "Manual",
      } as never)
      .eq("purity", purity);

    if (currentErr) {
      setSubmitting(false);
      setMessage({ type: "error", text: `Could not update rate: ${currentErr.message}` });
      return;
    }

    const { error: logErr } = await supabase.from("rate_log").insert({
      purity,
      rate_per_gram: rateValue,
      updated_on: now,
      updated_by: userEmail,
      source: "Manual",
    } as never);

    setSubmitting(false);

    if (logErr) {
      setMessage({ type: "error", text: `Rate updated but history log failed: ${logErr.message}` });
      return;
    }

    setMessage({ type: "ok", text: `${purity} updated to ₹${rateValue}/gram.` });
    setRate("");
    onUpdated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg bg-surface p-4 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
          Purity
        </label>
        <select
          value={purity}
          onChange={(e) => setPurity(e.target.value as Purity)}
          className="rounded-md border border-border bg-transparent px-3 py-2 text-[14px] text-foreground outline-none focus:border-primary"
        >
          {PURITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
          New rate (₹/gram)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="e.g. 14636.76"
          className="w-40 rounded-md border border-border bg-transparent px-3 py-2 text-[14px] text-foreground outline-none focus:border-primary placeholder:text-faint"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-primary px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Updating…" : "Update rate"}
      </button>

      {message && (
        <div
          className={`w-full text-[13px] ${
            message.type === "ok" ? "text-success-text" : "text-danger-text"
          }`}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}
