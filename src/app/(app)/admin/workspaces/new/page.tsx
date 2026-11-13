import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { listStaff } from "../../_lib/access";
import { ProvisionForm } from "./provision-form";

export const metadata: Metadata = { title: "Provision workspace" };

export default async function NewWorkspacePage() {
  await requirePlatformAdmin();
  const consultants = await listStaff(["consultant"]);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/workspaces" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Workspaces
      </Link>
      <PageHeader
        eyebrow="Workspaces"
        title="Provision a client workspace"
        description="Creates the workspace, invites the client's owner and gives assigned consultants access."
      />
      <ProvisionForm consultants={consultants.map(({ id, name, email }) => ({ id, name, email }))} />
    </div>
  );
}
