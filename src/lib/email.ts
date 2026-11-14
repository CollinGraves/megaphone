import "server-only";
import { hasResend } from "./env";
import { BRAND } from "@/lib/brand";

export type EmailMessage = { to: string; subject: string; html: string; text?: string };
export type EmailResult = { status: "sent" | "logged" | "failed"; id?: string; error?: string };

/**
 * Sends via Resend when RESEND_API_KEY is set; otherwise logs the email to the server console
 * (handy in development — invitation links etc. are printed there).
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!hasResend()) {
    console.info(`\n[email:dev] To: ${msg.to}\n[email:dev] Subject: ${msg.subject}\n[email:dev] ${msg.text ?? msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 800)}\n`);
    return { status: "logged" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? `${BRAND} <radar@northlabs.io>`,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", error: body.message ?? `HTTP ${res.status}` };
    return { status: "sent", id: body.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal, email-client-safe layout wrapper. */
export function emailLayout(opts: { preheader?: string; body: string; footer?: string }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0b1220;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:600">${BRAND} <span style="color:#94a3b8;font-weight:400">by North Labs</span></td></tr>
<tr><td style="padding:24px">${opts.body}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${opts.footer ?? `You're receiving this because you have an ${BRAND} account.`}</td></tr>
</table></td></tr></table></body></html>`;
}
