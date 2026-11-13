"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { applySignupContext } from "@/lib/signup-context";

export async function recordSignupContext(input: { ref?: string | null; source?: string | null }) {
  const current = await getCurrentUser();
  if (current) await applySignupContext(current, input);
}
