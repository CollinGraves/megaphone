import { Users } from "lucide-react";
import { inviteColleagues } from "@/app/(app)/feed/actions";
import { ActionForm, SubmitButton } from "./forms";
import { Card, Textarea } from "./ui";
import { BRAND } from "@/lib/brand";

export function InviteColleaguesCard({ domain, company, colleagues }: { domain: string; company: string; colleagues: number }) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Users className="size-4 text-radar-600" /> Share with your team
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {colleagues > 0
          ? `${colleagues} colleague${colleagues === 1 ? "" : "s"} from ${company} already use${colleagues === 1 ? "s" : ""} ${BRAND}.`
          : `Be the first to bring ${BRAND} to ${company}.`}{" "}
        Invite teammates who should be keeping up too.
      </p>
      <ActionForm action={inviteColleagues} className="mt-3 space-y-2" resetOnSuccess>
        <Textarea name="emails" rows={2} placeholder={`name@${domain}, another@${domain}`} className="min-h-0 text-sm" required />
        <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Sending…">
          Send invites
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}
