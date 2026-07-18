"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  // Starts false to match server-rendered markup, then syncs to the real
  // state (set by the inline script in layout.tsx) right after mount - this
  // avoids a hydration mismatch warning without needing to flash anything.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("nj-theme", next ? "dark" : "light");
    } catch {
      // Private browsing / storage disabled - theme just won't persist across visits.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-md border border-white/30 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/10"
    >
      {isDark ? "☀ Light" : "🌙 Dark"}
    </button>
  );
}
