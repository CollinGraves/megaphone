import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { classifyEmail, companyDomain, emailDomain } from "@/lib/email-domains";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { ensureCompany, requestEnrichment } from "@/lib/enrichment";
import { appUrl } from "@/lib/env";
import { socialProvidersEnabled } from "./providers";

const adminEmails = () =>
  (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** When true, personal (Gmail, Outlook…) addresses can't sign up at all. Disposable addresses never can. */
export const requireWorkEmail = () => process.env.REQUIRE_WORK_EMAIL === "true";

/** Run work after the response when inside a request; inline otherwise (scripts). */
function runAfter(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch((err) => console.error("[auth] background task failed", err));
  }
}

export const auth = betterAuth({
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  // Allow Vercel preview deployments to authenticate against their own URL.
  trustedOrigins: [appUrl(), ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
  },
  // Verification is encouraged, not required: it proves the person controls a business domain.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24 * 3,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Confirm your email for AI Radar",
        html: emailLayout({
          body: `<p style="font-size:15px">Hi ${escapeHtml(user.name.split(" ")[0] || "there")}, confirm your email to keep your AI Radar digest coming.</p>
<p><a href="${url}" style="display:inline-block;background:#12b393;color:#070b14;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Confirm my email</a></p>`,
        }),
        text: `Confirm your email for AI Radar: ${url}`,
      });
    },
  },
  // Google Workspace and Microsoft 365 sign-in. Each is enabled once its credentials are set.
  // Redirect URIs: {APP_URL}/api/auth/callback/google and {APP_URL}/api/auth/callback/microsoft
  socialProviders: {
    ...(socialProvidersEnabled().google
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            prompt: "select_account" as const,
          },
        }
      : {}),
    ...(socialProvidersEnabled().microsoft
      ? {
          microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID!,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
            // "organizations" = work and school accounts only (no personal Outlook.com / Hotmail).
            tenantId: process.env.MICROSOFT_TENANT_ID || "organizations",
            prompt: "select_account" as const,
          },
        }
      : {}),
  },
  // Someone who signed up with email/password can later use Google/Microsoft with the same verified address.
  account: { accountLinking: { enabled: true, trustedProviders: ["google", "microsoft"] } },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      const kind = classifyEmail(email);
      if (kind === "invalid") throw new APIError("BAD_REQUEST", { message: "Please enter a valid email address." });
      if (kind === "disposable") {
        throw new APIError("BAD_REQUEST", { message: "Temporary email addresses can't be used. Please use your work email." });
      }
      if (kind === "personal" && requireWorkEmail()) {
        throw new APIError("BAD_REQUEST", {
          message: `AI Radar is for business teams. Please sign up with your work email instead of ${emailDomain(email)}.`,
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Applies the same email policy to Google/Microsoft sign-ups as to the email form.
        before: async (candidate) => {
          const kind = classifyEmail(candidate.email);
          if (kind === "disposable" || kind === "invalid") return false;
          if (kind === "personal" && requireWorkEmail()) return false;
        },
        after: async (created) => {
          const email = created.email.toLowerCase();
          const isWork = classifyEmail(email) === "work";
          const domain = isWork ? companyDomain(emailDomain(email)) : null;
          await db
            .update(schema.user)
            .set({
              companyDomain: domain,
              ...(adminEmails().includes(email) ? { platformRole: "admin" as const } : {}),
            })
            .where(eq(schema.user.id, created.id));
          await db.insert(schema.userPreferences).values({ userId: created.id }).onConflictDoNothing();
          await db.insert(schema.leadProfiles).values({ userId: created.id }).onConflictDoNothing();
          await db.insert(schema.engagementEvents).values({ userId: created.id, type: "signup", metadata: { emailKind: classifyEmail(email) } });
          if (domain) {
            await ensureCompany(domain);
            runAfter(() => requestEnrichment(domain));
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
