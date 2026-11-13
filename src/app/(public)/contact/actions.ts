"use server";

import { z } from "zod";
import { db } from "@/db";
import { contactRequests } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { track } from "@/lib/tracking";
import type { ActionState } from "@/lib/utils";

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.email("Please enter a valid email").max(200),
  company: z.string().trim().max(200).optional(),
  message: z.string().trim().max(4000).optional(),
  source: z.string().trim().max(200).optional(),
});

export async function submitContactRequest(_prev: ActionState, form: FormData): Promise<ActionState> {
  // Honeypot: bots fill every field.
  if (form.get("website")) return { ok: true, message: "Thanks! We'll be in touch shortly." };
  const parsed = ContactSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    company: form.get("company") || undefined,
    message: form.get("message") || undefined,
    source: form.get("source") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const user = await getCurrentUser();
  const data = parsed.data;
  await db.insert(contactRequests).values({ ...data, email: data.email.toLowerCase(), userId: user?.id ?? null });
  await track("contact_request", { userId: user?.id, metadata: { source: data.source ?? null } });

  const notify = process.env.CONTACT_NOTIFY_EMAIL;
  if (notify) {
    await sendEmail({
      to: notify,
      subject: `New AI Radar contact request: ${data.name}${data.company ? ` (${data.company})` : ""}`,
      html: emailLayout({
        body: `<p><strong>${escapeHtml(data.name)}</strong> &lt;${escapeHtml(data.email)}&gt;${data.company ? ` — ${escapeHtml(data.company)}` : ""}</p><p>${escapeHtml(data.message ?? "(no message)")}</p><p style="color:#64748b">Source: ${escapeHtml(data.source ?? "contact page")}</p>`,
      }),
    });
  }
  return { ok: true, message: "Thanks! Someone from North Labs will reach out within one business day." };
}
