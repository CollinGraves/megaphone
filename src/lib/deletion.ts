import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, user } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";

/**
 * Permanent deletes for workspaces and user accounts, shared by workspace Settings and North Labs admin.
 * Every foreign key to organizations/user cascades or sets null, so one DELETE removes everything that
 * belongs to the workspace (initiatives, ideas, departments, activity, keys…) or the person.
 */

export class DeletionBlocked extends Error {}

/** Subscription states that are still billing (or about to). */
const BILLING_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

export function workspaceDeletionBlocker(org: { stripeSubscriptionId: string | null; subscriptionStatus: string | null; cancelAtPeriodEnd: boolean }): string | null {
  if (org.stripeSubscriptionId && org.subscriptionStatus && BILLING_STATUSES.has(org.subscriptionStatus) && !org.cancelAtPeriodEnd) {
    return "This workspace has an active subscription. Cancel it in Plan & billing first, so nobody is charged for a deleted workspace.";
  }
  return null;
}

export async function deleteWorkspace(orgId: string, actor: { id: string; name: string }) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw new DeletionBlocked("Workspace not found.");
  const blocker = workspaceDeletionBlocker(org);
  if (blocker) throw new DeletionBlocked(blocker);

  // Tell the other owners and admins (the workspace's own activity log is deleted with it).
  const notify = await db
    .select({ email: user.email })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ["owner", "admin"]), ne(memberships.userId, actor.id)));

  await db.delete(organizations).where(eq(organizations.id, orgId));
  console.info(`[deletion] workspace ${org.slug} (${org.id}) deleted by ${actor.id}`);

  await Promise.allSettled(
    notify.map((n) =>
      sendEmail({
        to: n.email,
        subject: `${org.name} was deleted from ${BRAND}`,
        html: emailLayout({ body: `<p>${escapeHtml(actor.name)} deleted the <strong>${escapeHtml(org.name)}</strong> workspace and everything in it.</p>` }),
        text: `${actor.name} deleted the ${org.name} workspace and everything in it.`,
      }),
    ),
  );
  return org;
}

/** Workspaces where this person is the only owner (deleting them would leave the workspace ownerless). */
export async function soleOwnedWorkspaces(userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, "owner"),
        sql`not exists (select 1 from ${memberships} m2 where m2.org_id = ${memberships.orgId} and m2.role = 'owner' and m2.user_id <> ${userId})`,
      ),
    );
}

export async function deleteUserAccount(userId: string, actor: { id: string }) {
  if (userId === actor.id) throw new DeletionBlocked("You can't delete your own account from here.");
  const [target] = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  if (!target) throw new DeletionBlocked("User not found.");
  const sole = await soleOwnedWorkspaces(userId);
  if (sole.length) {
    throw new DeletionBlocked(
      `${target.email} is the only owner of ${sole.map((w) => w.name).join(", ")}. Make someone else an owner or delete ${sole.length === 1 ? "that workspace" : "those workspaces"} first.`,
    );
  }
  await db.delete(user).where(eq(user.id, userId));
  console.info(`[deletion] user ${userId} deleted by ${actor.id}`);
  return target;
}
