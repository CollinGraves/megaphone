import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companyContacts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { csvCell } from "@/lib/leads";
import { isStaff } from "@/lib/permissions";

export async function GET(_request: Request, ctx: RouteContext<"/admin/accounts/[domain]/contacts">) {
  const me = await getCurrentUser();
  if (!me || !isStaff(me.platformRole)) return new Response("Not found", { status: 404 });
  const domain = decodeURIComponent((await ctx.params).domain).toLowerCase();
  const rows = await db.select().from(companyContacts).where(eq(companyContacts.domain, domain)).orderBy(companyContacts.fullName);
  const header = ["full_name", "title", "email", "linkedin_url", "company_domain", "source"];
  const lines = rows.map((r) => [r.fullName, r.title, r.email, r.linkedinUrl, r.domain, r.source].map(csvCell).join(","));
  return new Response("﻿" + [header.join(","), ...lines].join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="contacts-${domain.replace(/[^a-z0-9.-]/g, "")}.csv"`,
    },
  });
}
