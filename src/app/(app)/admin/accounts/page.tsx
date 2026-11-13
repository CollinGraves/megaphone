import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, ilike, isNotNull, max, or, sql } from "drizzle-orm";
import { Building2, Search } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { db } from "@/db";
import { companies, companyContacts, user } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { listLeads } from "@/lib/leads";
import { timeAgo } from "@/lib/utils";
import { ScoreBadge } from "../_components/badges";
import { EnrichmentBadge } from "./enrichment-badge";
import { param, type SearchParams } from "../_lib/params";
import { daysAgo } from "../_lib/time";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = param(sp, "q")?.trim().slice(0, 100);
  const since = daysAgo(30);

  const userCounts = db
    .select({ domain: user.companyDomain, users: count().as("users"), lastSignup: max(user.createdAt).as("last_signup") })
    .from(user)
    .where(and(isNotNull(user.companyDomain), eq(user.platformRole, "user")))
    .groupBy(user.companyDomain)
    .as("uc");
  const contactCounts = db
    .select({ domain: companyContacts.domain, contacts: count().as("contacts") })
    .from(companyContacts)
    .groupBy(companyContacts.domain)
    .as("cc");

  const [rows, [signups], sources, leads] = await Promise.all([
    db
      .select({
        company: companies,
        users: sql<number>`coalesce(${userCounts.users}, 0)::int`,
        lastSignup: userCounts.lastSignup,
        contacts: sql<number>`coalesce(${contactCounts.contacts}, 0)::int`,
      })
      .from(companies)
      .leftJoin(userCounts, eq(userCounts.domain, companies.domain))
      .leftJoin(contactCounts, eq(contactCounts.domain, companies.domain))
      .where(q ? or(ilike(companies.domain, `%${q}%`), ilike(companies.name, `%${q}%`)) : undefined)
      .orderBy(desc(sql`coalesce(${userCounts.users}, 0)`), desc(userCounts.lastSignup))
      .limit(200),
    db
      .select({ total: count(), work: sql<number>`count(${user.companyDomain})::int` })
      .from(user)
      .where(and(gte(user.createdAt, since), eq(user.platformRole, "user"))),
    db
      .select({ source: user.signupSource, total: count(), work: sql<number>`count(${user.companyDomain})::int` })
      .from(user)
      .where(and(gte(user.createdAt, since), eq(user.platformRole, "user")))
      .groupBy(user.signupSource)
      .orderBy(desc(count())),
    listLeads({}),
  ]);

  // Hottest lead per account.
  const domainOfUser = new Map<string, string>();
  for (const r of await db.select({ id: user.id, domain: user.companyDomain }).from(user).where(isNotNull(user.companyDomain))) {
    if (r.domain) domainOfUser.set(r.id, r.domain);
  }
  const bestLead = new Map<string, (typeof leads)[number]>();
  for (const lead of leads) {
    const d = domainOfUser.get(lead.id);
    if (d && (!bestLead.has(d) || bestLead.get(d)!.score.score < lead.score.score)) bestLead.set(d, lead);
  }
  const workPct = signups && signups.total > 0 ? Math.round((signups.work / signups.total) * 100) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Accounts"
        title="Company accounts"
        description="Every business email domain that has signed up, with enrichment from your data provider and the people we know there."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat label="Sign-ups · 30 days" value={signups?.total ?? 0} />
        <Stat label="Work email rate · 30 days" value={`${workPct}%`} hint={`${signups?.work ?? 0} business addresses`} />
        <Card className="px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Top sign-up sources · 30 days</div>
          <ul className="mt-2 space-y-1 text-sm">
            {sources.slice(0, 4).map((s) => (
              <li key={s.source ?? "unknown"} className="flex justify-between gap-2">
                <span className="truncate text-slate-700">{s.source ?? "unknown"}</span>
                <span className="shrink-0 text-slate-500 tabular-nums">
                  {s.total} <span className="text-xs">({s.work} work)</span>
                </span>
              </li>
            ))}
            {sources.length === 0 ? <li className="text-slate-500">No sign-ups yet</li> : null}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`${rows.length} accounts`}
          action={
            <form className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={q} placeholder="Search domain or name" className="h-9 pl-9" />
            </form>
          }
        />
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState icon={<Building2 className="size-6" />} title="No accounts yet" description="Accounts appear when someone signs up with a work email." />
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Size</Th>
                <Th>Industry</Th>
                <Th className="text-right">People</Th>
                <Th>Hottest lead</Th>
                <Th className="text-right">Contacts</Th>
                <Th>Enrichment</Th>
                <Th>Last sign-up</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ company: c, users, contacts, lastSignup }) => {
                const lead = bestLead.get(c.domain);
                return (
                  <tr key={c.domain} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/admin/accounts/${encodeURIComponent(c.domain)}`} className="font-medium text-slate-900 hover:text-radar-700">
                        {c.name}
                      </Link>
                      <div className="text-xs text-slate-500">{c.domain}</div>
                    </Td>
                    <Td>{c.sizeRange ?? "—"}</Td>
                    <Td className="max-w-48 truncate">{c.industry ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{users}</Td>
                    <Td>
                      {lead ? (
                        <Link href={`/admin/leads/${lead.id}`} className="flex items-center gap-2 hover:text-radar-700">
                          <ScoreBadge score={lead.score} />
                          <span className="truncate text-sm">{lead.name}</span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{contacts}</Td>
                    <Td>
                      <EnrichmentBadge status={c.enrichmentStatus} />
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{lastSignup ? timeAgo(lastSignup) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
