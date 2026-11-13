import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { appUrl } from "@/lib/env";

const adminEmails = () =>
  (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const auth = betterAuth({
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
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
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          const email = created.email.toLowerCase();
          if (adminEmails().includes(email)) {
            await db.update(schema.user).set({ platformRole: "admin" }).where(eq(schema.user.id, created.id));
          }
          await db.insert(schema.userPreferences).values({ userId: created.id }).onConflictDoNothing();
          await db.insert(schema.leadProfiles).values({ userId: created.id }).onConflictDoNothing();
          await db.insert(schema.engagementEvents).values({ userId: created.id, type: "signup" });
        },
      },
    },
  },
  plugins: [nextCookies()],
});
