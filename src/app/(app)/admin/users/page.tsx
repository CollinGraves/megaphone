import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { platformRole, user } from "@/db/schema";
import { Badge, Button, ButtonLink, Card, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { intParam, oneOf, param } from "../_lib/params";
import { AutoSubmitSelect } from "../_components/auto-submit-select";
import { InlineForm } from "../_components/inline-form";
import { Pager } from "../_components/pager";
import { setPlatformRole } from "./actions";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 50;
const ROLE_LABELS = { user: "User", consultant: "Consultant", admin: "Admin" } as const;
const ROLE_HINTS = {
  user: "Radar reader / lead. Workspace access via membership only.",
  consultant: "North Labs consultant. Sees leads and assigned workspaces.",
  admin: "North Labs admin. Full access to the admin console.",
} as const;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requirePlatformAdmin();
  const sp = await searchParams;
  const role = oneOf(param(sp, "role"), platformRole.enumValues);
  const q = param(sp, "q")?.slice(0, 100);
  const page = intParam(sp, "page", { min: 1, max: 10_000 }) ?? 1;

  const where: SQL[] = [];
  if (role) where.push(eq(user.platformRole, role));
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(user.name, pattern), ilike(user.email, pattern), ilike(user.company, pattern))!);
  }
  const condition = where.length ? and(...where) : undefined;

  const [rows, [{ total }], roleCounts] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, company: user.company, platformRole: user.platformRole, createdAt: user.createdAt })
      .from(user)
      .where(condition)
      // Staff first, then newest.
      .orderBy(desc(eq(user.platformRole, "admin")), desc(eq(user.platformRole, "consultant")), desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(user).where(condition),
    db.select({ role: user.platformRole, n: count() }).from(user).groupBy(user.platformRole),
  ]);
  const counts = Object.fromEntries(roleCounts.map((r) => [r.role, r.n])) as Partial<Record<keyof typeof ROLE_LABELS, number>>;

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Users & platform roles"
        description="Grant North Labs staff access to the admin console. Roles take effect on the user's next request."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {platformRole.enumValues.map((r) => (
          <Card key={r} className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-900">{ROLE_LABELS[r]}s</span>
              <span className="text-lg font-semibold tabular-nums text-slate-900">{counts[r] ?? 0}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{ROLE_HINTS[r]}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_auto]">
          <Input name="q" type="search" placeholder="Search name, email, company…" defaultValue={q} aria-label="Search" />
          <Select name="role" defaultValue={role ?? ""} aria-label="Role">
            <option value="">All roles</option>
            {platformRole.enumValues.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Filter
            </Button>
            {role || q ? (
              <ButtonLink href="/admin/users" variant="ghost">
                Reset
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th className="hidden md:table-cell">Company</Th>
              <Th className="hidden sm:table-cell">Joined</Th>
              <Th>Platform role</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <Td>
                  {u.platformRole === "user" ? (
                    <Link href={`/admin/leads/${u.id}`} className="font-medium text-slate-900 hover:text-radar-700">
                      {u.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{u.name}</span>
                  )}
                  <div className="text-xs text-slate-500">{u.email}</div>
                </Td>
                <Td className="hidden md:table-cell">{u.company ?? <span className="text-slate-400">—</span>}</Td>
                <Td className="hidden whitespace-nowrap text-slate-500 sm:table-cell">{formatDate(u.createdAt)}</Td>
                <Td>
                  {u.id === me.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Badge tone="dark">{ROLE_LABELS[u.platformRole]}</Badge>
                      <span className="text-xs text-slate-500">you</span>
                    </span>
                  ) : (
                    <InlineForm action={setPlatformRole}>
                      <input type="hidden" name="userId" value={u.id} />
                      <AutoSubmitSelect key={u.platformRole} name="role" defaultValue={u.platformRole} aria-label={`Platform role for ${u.name}`} className="h-8 w-36">
                        {platformRole.enumValues.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </InlineForm>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pager basePath="/admin/users" params={{ role, q }} page={page} pageSize={PAGE_SIZE} total={total} />
      </Card>
    </>
  );
}
