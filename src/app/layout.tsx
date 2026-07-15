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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
