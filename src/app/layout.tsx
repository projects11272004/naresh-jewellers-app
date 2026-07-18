import type { Metadata } from "next";
import "./globals.css";

// Intentionally using the system font stack (declared in globals.css) instead of
// next/font/google — avoids a Google Fonts network fetch at build time, which
// keeps builds reliable in restricted/offline CI environments and keeps the
// production bundle lighter for a business dashboard like this one.

export const metadata: Metadata = {
  title: "Naresh Jewellers — Showroom Management",
  description: "Phase 1: Rate Master — live gold & silver rate dashboard",
};

// Runs before React hydrates, applying the saved theme (or system preference,
// if nothing saved yet) directly to <html> as a `dark` class. Without this,
// the page would render light for a split second before JS caught up and
// switched to dark — this script removes that flash entirely.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var theme = localStorage.getItem('nj-theme');
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
