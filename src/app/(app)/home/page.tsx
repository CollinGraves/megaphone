import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { consultantAssignments, memberships, organizations, user as userTable } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { track } from "@/lib/tracking";

/**
 * Where signed-in people land: their workspace (the one they joined most recently), or workspace
 * setup if they don't have one yet. North Labs staff without a workspace go to Admin.
 */
export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const me = await requireUser("/home");
  const deleted = (await searchParams).deleted === "workspace";
  const [own] = await db
    .select({ slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.userId, me.id), eq(organizations.status, "active")))
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  if (own) {
    // "Onboarded" now means: has a workspace (admin stats and lead scoring read this).
    if (!me.onboardedAt) {
      const [first] = await db
        .update(userTable)
        .set({ onboardedAt: new Date() })
        .where(and(eq(userTable.id, me.id), isNull(userTable.onboardedAt)))
        .returning({ id: userTable.id });
      if (first) await track("onboarded", { userId: me.id, metadata: { via: "workspace" } });
    }
    redirect(`/w/${own.slug}`);
  }
  if (me.platformRole === "consultant") {
    const [assigned] = await db
      .select({ slug: organizations.slug })
      .from(consultantAssignments)
      .innerJoin(organizations, eq(consultantAssignments.orgId, organizations.id))
      .where(eq(consultantAssignments.userId, me.id))
      .limit(1);
    if (assigned) redirect(`/w/${assigned.slug}`);
  }
  if (me.platformRole === "admin") redirect("/admin");
  redirect(deleted ? "/workspaces/new?deleted=workspace" : "/workspaces/new");
}
