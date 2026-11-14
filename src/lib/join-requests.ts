import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, joinRequests, memberships, organizations, user, type OrgRole } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";

/**
 * Join requests: someone from a workspace's company domain asks to be let in instead of creating a
 * duplicate workspace. Owners and admins approve (choosing the role) or decline from Settings.
 */

type Requester = { id: string; name: string; email: string; companyDomain: string | null };
type Org = { id: string; name: string; slug: string; emailDomain: string | null };

export class JoinRequestError extends Error {}

const settingsUrl = (slug: string) => `${appUrl()}/w/${slug}/settings#join-requests`;

async function adminEmails(orgId: string) {
  return db
    .select({ email: user.email, name: user.name })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ["owner", "admin"])))
    .orderBy(asc(memberships.createdAt));
}

/** Create a pending request (idempotent while one is open) and tell the workspace's owners and admins. */
export async function createJoinRequest(me: Requester, org: Org, message: string | null) {
  if (!me.companyDomain || me.companyDomain !== org.emailDomain) {
    throw new JoinRequestError("You can only ask to join your own company's workspace.");
  }
  const [existing] = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, me.id)))
    .limit(1);
  if (existing) throw new JoinRequestError(`You're already a member of ${org.name}.`);

  const [created] = await db
    .insert(joinRequests)
    .values({ orgId: org.id, userId: me.id, message })
    .onConflictDoNothing()
    .returning({ id: joinRequests.id });
  if (!created) return { created: false as const };

  await db.insert(activityLog).values({
    orgId: org.id,
    userId: me.id,
    action: "member.join_requested",
    detail: { name: me.name, email: me.email },
  });

  const admins = await adminEmails(org.id);
  const url = settingsUrl(org.slug);
  const note = message ? `<p style="margin:12px 0;padding:10px 12px;background:#f8fafc;border-radius:8px">“${escapeHtml(message)}”</p>` : "";
  await Promise.allSettled(
    admins.map((a) =>
      sendEmail({
        to: a.email,
        subject: `${me.name} asked to join ${org.name} on ${BRAND}`,
        html: emailLayout({
          preheader: `${me.name} (${me.email}) wants to join your workspace.`,
          body: `<p>${escapeHtml(me.name)} (${escapeHtml(me.email)}) asked to join <strong>${escapeHtml(org.name)}</strong>.</p>${note}
<p><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Review the request</a></p>`,
        }),
        text: `${me.name} (${me.email}) asked to join ${org.name}.${message ? `\n\n"${message}"` : ""}\n\nReview it: ${url}`,
      }),
    ),
  );
  return { created: true as const };
}

export async function cancelJoinRequest(userId: string, requestId: string) {
  await db
    .update(joinRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.userId, userId), eq(joinRequests.status, "pending")));
}

export async function listPendingJoinRequests(orgId: string) {
  return db
    .select({
      id: joinRequests.id,
      message: joinRequests.message,
      createdAt: joinRequests.createdAt,
      userId: user.id,
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle,
    })
    .from(joinRequests)
    .innerJoin(user, eq(user.id, joinRequests.userId))
    .where(and(eq(joinRequests.orgId, orgId), eq(joinRequests.status, "pending")))
    .orderBy(asc(joinRequests.createdAt));
}

/** Approve (adding the member with `role`) or decline a pending request. Caller checks permissions. */
export async function decideJoinRequest(opts: {
  orgId: string;
  requestId: string;
  decision: "approve" | "decline";
  role: OrgRole;
  actor: { id: string; name: string };
}) {
  const result = await db.transaction(async (tx) => {
    const [req] = await tx
      .select({ id: joinRequests.id, userId: joinRequests.userId, name: user.name, email: user.email })
      .from(joinRequests)
      .innerJoin(user, eq(user.id, joinRequests.userId))
      .where(and(eq(joinRequests.id, opts.requestId), eq(joinRequests.orgId, opts.orgId), eq(joinRequests.status, "pending")))
      .limit(1)
      .for("update");
    if (!req) throw new JoinRequestError("That request was already handled.");
    const approve = opts.decision === "approve";
    if (approve) {
      await tx.insert(memberships).values({ orgId: opts.orgId, userId: req.userId, role: opts.role }).onConflictDoNothing();
    }
    await tx
      .update(joinRequests)
      .set({
        status: approve ? "approved" : "declined",
        grantedRole: approve ? opts.role : null,
        decidedById: opts.actor.id,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(joinRequests.id, req.id));
    await tx.insert(activityLog).values({
      orgId: opts.orgId,
      userId: opts.actor.id,
      action: approve ? "member.join_approved" : "member.join_declined",
      detail: { name: req.name, email: req.email, ...(approve ? { role: opts.role } : {}) },
    });
    return req;
  });

  const [org] = await db.select({ name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, opts.orgId)).limit(1);
  if (org) {
    const approve = opts.decision === "approve";
    const url = `${appUrl()}/w/${org.slug}`;
    await sendEmail({
      to: result.email,
      subject: approve ? `You're in: ${org.name} on ${BRAND}` : `Your request to join ${org.name}`,
      html: emailLayout({
        body: approve
          ? `<p>${escapeHtml(opts.actor.name)} added you to <strong>${escapeHtml(org.name)}</strong>.</p><p><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the workspace</a></p>`
          : `<p>Your request to join <strong>${escapeHtml(org.name)}</strong> wasn't approved. If you think that's a mistake, ask a workspace admin to invite you.</p>`,
      }),
      text: approve ? `${opts.actor.name} added you to ${org.name}. Open it: ${url}` : `Your request to join ${org.name} wasn't approved. Ask a workspace admin to invite you if that's a mistake.`,
    }).catch(() => undefined);
  }
  return result;
}
