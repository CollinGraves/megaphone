import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, buttonClass, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { db } from "@/db";
import { companies, companyContacts, user } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { listLeads } from "@/lib/leads";
import { COMPANY_SIZES } from "@/lib/taxonomy";
import { formatDate, timeAgo } from "@/lib/utils";
import { LeadStatusBadge, ScoreBadge } from "../../_components/badges";
import { requestCompanyEnrichment, updateCompany } from "../actions";
import { EnrichmentBadge } from "../enrichment-badge";

export async function generateMetadata({ params }: PageProps<"/admin/accounts/[domain]">): Promise<Metadata> {
  return { title: decodeURIComponent((await params).domain) };
}

export default async function AccountPage({ params }: PageProps<"/admin/accounts/[domain]">) {
  await requireStaff();
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  const [company] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
  if (!company) notFound();

  const [people, contacts] = await Promise.all([
    db.select({ id: user.id, email: user.email }).from(user).where(eq(user.companyDomain, domain)),
    db.select().from(companyContacts).where(eq(companyContacts.domain, domain)).orderBy(companyContacts.fullName),
  ]);
  const leads = people.length ? await listLeads({ userIds: people.map((p) => p.id) }) : [];
  leads.sort((a, b) => b.score.score - a.score.score);
  const knownEmails = new Set(people.map((p) => p.email.toLowerCase()));

  return (
    <div className="space-y-6">
      <Link href="/admin/accounts" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Accounts
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{company.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{company.domain}</span>
            <EnrichmentBadge status={company.enrichmentStatus} />
            {company.enrichedAt ? <span>enriched {timeAgo(company.enrichedAt)}{company.enrichmentSource ? ` via ${company.enrichmentSource}` : ""}</span> : null}
          </div>
        </div>
        <ActionForm action={requestCompanyEnrichment} className="space-y-2">
          <input type="hidden" name="domain" value={company.domain} />
          <SubmitButton variant="secondary" pendingText="Requesting…">
            {company.enrichmentStatus === "enriched" ? "Re-enrich" : "Request enrichment"}
          </SubmitButton>
        </ActionForm>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={`People on AI Radar (${leads.length})`} description="Signed-up users with this email domain." />
            {leads.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No one from this domain has signed up yet.</p>
              </CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Score</Th>
                    <Th>Status</Th>
                    <Th>Signed up</Th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <Td>
                        <Link href={`/admin/leads/${l.id}`} className="font-medium text-slate-900 hover:text-radar-700">
                          {l.name}
                        </Link>
                        <div className="text-xs text-slate-500">{l.jobTitle ?? l.email}</div>
                      </Td>
                      <Td>
                        <ScoreBadge score={l.score} />
                      </Td>
                      <Td>
                        <LeadStatusBadge status={l.status} />
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">{formatDate(l.signedUpAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`Other contacts (${contacts.length})`}
              description="Found by enrichment. Use for North Labs outreach; AI Radar never emails them automatically."
              action={
                contacts.length ? (
                  <a href={`/admin/accounts/${encodeURIComponent(company.domain)}/contacts`} className={buttonClass("secondary", "sm")}>
                    <Download className="size-4" /> CSV
                  </a>
                ) : null
              }
            />
            {contacts.length === 0 ? (
              <CardBody>
                <EmptyState
                  title="No contacts yet"
                  description="When your enrichment provider returns people for this company (e.g. a Clay 'find people' step), they'll be listed here."
                />
              </CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Title</Th>
                    <Th>Email</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <Td className="font-medium text-slate-900">{c.fullName}</Td>
                      <Td>{c.title ?? "—"}</Td>
                      <Td>
                        {c.email ?? "—"}{" "}
                        {c.email && knownEmails.has(c.email) ? <Badge tone="radar">On AI Radar</Badge> : null}
                      </Td>
                      <Td>
                        {c.linkedinUrl ? (
                          <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-700" aria-label="LinkedIn profile">
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Company profile" description="Filled by enrichment; editable." />
          <CardBody>
            {company.description ? <p className="mb-4 text-sm text-slate-600">{company.description}</p> : null}
            {company.employeeCount ? (
              <Alert className="mb-4">
                ~{company.employeeCount.toLocaleString()} employees{company.headquarters ? ` · HQ ${company.headquarters}` : ""}
              </Alert>
            ) : null}
            <ActionForm action={updateCompany}>
              <input type="hidden" name="domain" value={company.domain} />
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={company.name} required />
              </Field>
              <Field label="Industry" htmlFor="industry">
                <Input id="industry" name="industry" defaultValue={company.industry ?? ""} />
              </Field>
              <Field label="Company size" htmlFor="sizeRange">
                <Select id="sizeRange" name="sizeRange" defaultValue={company.sizeRange ?? ""}>
                  <option value="">Unknown</option>
                  {COMPANY_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s} employees
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Website" htmlFor="website">
                <Input id="website" name="website" defaultValue={company.website ?? `https://${company.domain}`} />
              </Field>
              <Field label="LinkedIn" htmlFor="linkedinUrl">
                <Input id="linkedinUrl" name="linkedinUrl" defaultValue={company.linkedinUrl ?? ""} />
              </Field>
              <SubmitButton>Save account</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
