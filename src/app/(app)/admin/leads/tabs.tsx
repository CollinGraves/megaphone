import Link from "next/link";
import { cn } from "@/lib/utils";

export function LeadsTabs({ active, openRequests }: { active: "leads" | "requests"; openRequests: number }) {
  const tab = (key: "leads" | "requests", href: string, label: string, badge?: number) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
        active === key ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900",
      )}
    >
      {label}
      {badge ? (
        <span className="rounded-full bg-radar-500 px-1.5 text-[11px] font-semibold text-ink-950 tabular-nums">{badge}</span>
      ) : null}
    </Link>
  );
  return (
    <div className="mb-5 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
      {tab("leads", "/admin/leads", "Leads")}
      {tab("requests", "/admin/leads/requests", "Contact requests", openRequests)}
    </div>
  );
}
