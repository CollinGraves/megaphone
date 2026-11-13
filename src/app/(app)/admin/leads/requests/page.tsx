import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { db } from "@/db";
import { contactRequests, user } from "@/db/schema";
import { SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { intParam, oneOf, param, qs } from "../../_lib/params";
import { Pager } from "../../_components/pager";
import { setContactRequestHandled } from "../actions";
import { LeadsTabs } from "../tabs";

export const metadata: Metadata = { title: "Contact requests" };

const VIEWS = ["open", "handled", "all"] as const;
const PAGE_SIZE = 30;

export default async function ContactRequestsPage({ searchParams }: PageProps<"/admin/leads/requests">) {
  await requireStaff();
  const sp = await searchParams;
  const view = oneOf(param(sp, "view"), VIEWS) ?? "open";
  const page = intParam(sp, "page", { min: 1, max: 10_000 }) ?? 1;
  const where =
    view === "open" ? isNull(contactRequests.handledAt) : view === "handled" ? isNotNull(contactRequests.handledAt) : undefined;

  const [rows, [{ total }], [{ open }]] = await Promise.all([
    db
      .select()
      .from(contactRequests)
      .where(where)
      .orderBy(desc(contactRequests.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(contactRequests).where(where),
    db.select({ open: count() }).from(contactRequests).where(isNull(contactRequests.handledAt)),
  ]);

  // Link each request to a lead profile, by user id or (for anonymous submissions) by email.
  const emails = [...new Set(rows.map((r) => r.email.toLowerCase()))];
  const ids = [...new Set(rows.map((r) => r.userId).filter((v): v is string => Boolean(v)))];
  const people =
    emails.length || ids.length
      ? await db
          .select({ id: user.id, email: user.email, platformRole: user.platformRole })
          .from(user)
          .where(or(inArray(user.id, ids), inArray(sql`lower(${user.email})`, emails)))
      : [];
  const leadFor = (r: (typeof rows)[number]) => {
    const match = people.find((p) => p.id === r.userId) ?? people.find((p) => p.email.toLowerCase() === r.email.toLowerCase());
    return match && match.platformRole === "user" ? match.id : null;
  };

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Contact requests"
        description="Submissions from the public “Talk to North Labs” form. Mark them handled once someone has followed up."
      />
      <LeadsTabs active="requests" openRequests={open} />

      <div className="mb-4 flex gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/admin/leads/requests${qs({ view: v === "open" ? undefined : v })}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm capitalize",
              v === view ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
            )}
          >
            {v}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title={view === "open" ? "No open requests" : "No requests"}
          description={view === "open" ? "Everything has been followed up." : undefined}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const leadId = leadFor(r);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {leadId ? (
                        <Link href={`/admin/leads/${leadId}`} className="font-medium text-slate-900 hover:text-radar-700">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{r.name}</span>
                      )}
                      {r.company ? <span className="text-sm text-slate-500">· {r.company}</span> : null}
                      {r.handledAt ? <Badge tone="radar">Handled</Badge> : <Badge tone="amber">Open</Badge>}
                      {r.source ? <Badge>{r.source}</Badge> : null}
                    </div>
                    <div className="mt-0.5 text-sm">
                      <a href={`mailto:${r.email}`} className="text-radar-700 hover:underline">
                        {r.email}
                      </a>
                      <span className="text-slate-400"> · </span>
                      <time dateTime={r.createdAt.toISOString()} title={formatDate(r.createdAt)} className="text-slate-500">
                        {timeAgo(r.createdAt)}
                      </time>
                    </div>
                    {r.message ? <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.message}</p> : null}
                  </div>
                  <form action={setContactRequestHandled} className="shrink-0">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="handled" value={r.handledAt ? "0" : "1"} />
                    <SubmitButton variant={r.handledAt ? "ghost" : "secondary"} size="sm" pendingText="…">
                      {r.handledAt ? "Reopen" : "Mark handled"}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
          <Pager
            basePath="/admin/leads/requests"
            params={{ view: view === "open" ? undefined : view }}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </Card>
      )}
    </>
  );
}
