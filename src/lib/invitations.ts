import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, memberships, organizations, user, type OrgRole } from "@/db/schema";
import { emailLayout, escapeHtml, sendEmail } from "./email";
import { appUrl } from "./env";
import { BRAND } from "@/lib/brand";

const INVITE_TTL_DAYS = 14;

export function inviteUrl(token: string) {
  return `${appUrl()}/invite/${token}`;
}

/**
 * Invite someone to a workspace. If they already have an account they're added immediately
 * (and still notified); otherwise an invitation link is emailed. Returns the invite URL so
 * North Labs staff can also share it manually.
 */
export async function createInvitation(opts: {
  orgId: string;
  email: string;
  role: OrgRole;
  invitedById: string;
  invitedByName: string;
}): Promise<{ status: "added" | "invited"; url?: string }> {
  const email = opts.email.trim().toLowerCase();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, opts.orgId)).limit(1);
  if (!org) throw new Error("Workspace not found");

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existingUser) {
    await db
      .insert(memberships)
      .values({ orgId: org.id, userId: existingUser.id, role: opts.role })
      .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: opts.role } });
    await sendEmail({
      to: email,
      subject: `You've been added to ${org.name} on ${BRAND}`,
      html: emailLayout({
        body: `<p style="font-size:15px">${escapeHtml(opts.invitedByName)} added you to the <strong>${escapeHtml(org.name)}</strong> AI workspace.</p>
<p><a href="${appUrl()}/w/${org.slug}" style="display:inline-block;background:#12b393;color:#070b14;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open workspace</a></p>`,
      }),
    });
    return { status: "added" };
  }

  // Revoke any outstanding invite for the same email so only the latest link works.
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.orgId, org.id), eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));

  const token = randomBytes(24).toString("base64url");
  await db.insert(invitations).values({
    orgId: org.id,
    email,
    role: opts.role,
    token,
    invitedById: opts.invitedById,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  const url = inviteUrl(token);
  await sendEmail({
    to: email,
    subject: `Join ${org.name} on ${BRAND}`,
    html: emailLayout({
      body: `<p style="font-size:15px">${escapeHtml(opts.invitedByName)} invited you to the <strong>${escapeHtml(org.name)}</strong> AI workspace on ${BRAND} — the single source of truth for your company's AI initiatives.</p>
<p><a href="${url}" style="display:inline-block;background:#12b393;color:#070b14;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Accept invitation</a></p>
<p style="font-size:12px;color:#64748b">This link expires in ${INVITE_TTL_DAYS} days.</p>`,
    }),
    text: `${opts.invitedByName} invited you to ${org.name} on ${BRAND}: ${url}`,
  });
  return { status: "invited", url };
}

export async function findInvitation(token: string) {
  const [row] = await db
    .select({ invitation: invitations, org: organizations })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.orgId, organizations.id))
    .where(eq(invitations.token, token))
    .limit(1);
  if (!row) return null;
  const { invitation } = row;
  const state = invitation.revokedAt
    ? "revoked"
    : invitation.acceptedAt
      ? "accepted"
      : invitation.expiresAt < new Date()
        ? "expired"
        : "valid";
  return { ...row, state } as const;
}

/** Accept an invitation for the signed-in user. The signed-in email must match the invited email. */
export async function acceptInvitation(token: string, current: { id: string; email: string }) {
  const found = await findInvitation(token);
  if (!found || found.state !== "valid") return { ok: false as const, error: "This invitation is no longer valid." };
  if (found.invitation.email !== current.email.toLowerCase()) {
    return { ok: false as const, error: `This invitation was sent to ${found.invitation.email}. Sign in with that email to accept it.` };
  }
  await db
    .insert(memberships)
    .values({ orgId: found.org.id, userId: current.id, role: found.invitation.role })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: found.invitation.role } });
  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, found.invitation.id));
  return { ok: true as const, slug: found.org.slug };
}
