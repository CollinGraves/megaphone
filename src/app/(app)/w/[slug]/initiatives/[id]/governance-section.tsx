import type { Initiative, Organization } from "@/db/schema";

/**
 * Governance panel on the initiative page: risk classification, oversight, approval workflow.
 * PLACEHOLDER: implemented by the governance work.
 */
export async function GovernanceSection(props: {
  slug: string;
  org: Organization;
  initiative: Initiative;
  canEdit: boolean;
  canApprove: boolean;
}) {
  void props;
  return null;
}
