"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Gauge, Newspaper, Rss, UserRoundSearch, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: Gauge, adminOnly: false, exact: true },
  { href: "/admin/leads", label: "Leads", icon: UserRoundSearch, adminOnly: false },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building2, adminOnly: false },
  { href: "/admin/sources", label: "Sources", icon: Rss, adminOnly: true },
  { href: "/admin/stories", label: "Stories", icon: Newspaper, adminOnly: true },
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
] as const;

export function AdminNav({ isAdmin, openRequests }: { isAdmin: boolean; openRequests: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mb-px flex gap-1 overflow-x-auto">
      {ITEMS.filter((i) => isAdmin || !i.adminOnly).map(({ href, label, icon: Icon, ...item }) => {
        const active = "exact" in item ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-radar-500 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {href === "/admin/leads" && openRequests > 0 ? (
              <span className="rounded-full bg-radar-500 px-1.5 text-[11px] font-semibold text-ink-950 tabular-nums">
                {openRequests}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
