import type { Metadata } from "next";
import { isNull, sql } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { contactRequests } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { AdminNav } from "./_components/admin-nav";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: { template: `%s · Admin · ${BRAND}`, default: `Admin · ${BRAND}` } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const me = await requireStaff();
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(contactRequests)
    .where(isNull(contactRequests.handledAt));

  return (
    <div className="min-h-full">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center gap-2 pt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
            <ShieldCheck className="size-4 text-radar-600" aria-hidden />
            North Labs Admin
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-slate-600">
              {me.platformRole === "admin" ? "Admin" : "Consultant"}
            </span>
          </div>
          <div className="mt-2">
            <AdminNav isAdmin={me.platformRole === "admin"} openRequests={open} />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
