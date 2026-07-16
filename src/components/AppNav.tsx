"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Rate Master" },
  // { href: "/inventory", label: "Inventory" }, // added in Phase 2 build-out
  { href: "/team", label: "Team & Access", adminOnly: true },
];

export default function AppNav({ role }: { role: UserRole | null }) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");
  if (items.length <= 1) return null;

  return (
    <nav className="flex gap-1 border-b border-[#E3E5E8] bg-white px-8">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2.5 text-[13px] font-medium border-b-2 ${
              active
                ? "border-[#1F3864] text-[#1F3864]"
                : "border-transparent text-[#5B6472] hover:text-[#1F3864]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
