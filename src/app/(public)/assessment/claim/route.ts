import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { claimAssessment, isClaimTokenShape, sendClaimEmails } from "@/lib/assessment/server";
import { applySignupContext } from "@/lib/signup-context";

/**
 * /assessment/claim?token=… — the `next` target of the assessment sign-up gate. Attaches the
 * anonymous assessment to the signed-in user (only while unclaimed), emails them the summary and
 * continues to the full report (via the short profile step if they haven't onboarded yet).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!isClaimTokenShape(token)) redirect("/assessment?claim=invalid");

  const current = await getCurrentUser();
  if (!current) {
    const next = `/assessment/claim?token=${encodeURIComponent(token)}`;
    redirect(`/sign-up?src=assessment&next=${encodeURIComponent(next)}`);
  }

  // Google/Microsoft sign-ups skip the sign-up form, so record the acquisition source here.
  await applySignupContext(current, { source: "assessment" });

  const result = await claimAssessment(token, current);
  if (result.status === "not_found") redirect("/assessment?claim=invalid");
  if (result.status === "taken") redirect("/assessment?claim=taken");
  if (result.status === "claimed") after(() => sendClaimEmails(result.assessment, current));

  const id = result.assessment.id;
  if (!current.onboardedAt) redirect(`/assessment/${id}/setup`);
  redirect(`/assessment/${id}${result.status === "claimed" ? "?welcome=1" : ""}`);
}
