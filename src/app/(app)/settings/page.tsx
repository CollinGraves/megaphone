import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/forms";
import { InterestFields, ProfileFields } from "@/components/preferences-fields";
import { CreateApiKeyForm } from "@/components/api-keys";
import { StackCard } from "@/components/stack/stack-card";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { appUrl } from "@/lib/env";
import { listApiKeys } from "@/lib/mcp/keys";
import { TOOL_CATALOG } from "@/lib/mcp/tools";
import { formatDate, timeAgo } from "@/lib/utils";
import { listAccessibleWorkspaces } from "@/lib/workspace";
import { revokeKeyAction } from "./api-key-actions";
import { getStackContext } from "@/lib/graph/personalize";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { updateSettings } from "./actions";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1);
  const defaults = { ...user, ...prefs };
  const [stack, keys, workspaces] = await Promise.all([getStackContext(user), listApiKeys(user.id), listAccessibleWorkspaces(user)]);
  const mcpUrl = `${appUrl()}/api/mcp`;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Settings & preferences" description={`Signed in as ${user.email}`} />
      <ActionForm action={updateSettings} className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-5 font-semibold text-slate-900">Profile</h2>
          <ProfileFields d={defaults} />
        </Card>
        <Card className="p-6">
          <h2 className="mb-5 font-semibold text-slate-900">Feed &amp; digest</h2>
          <InterestFields d={defaults} />
        </Card>
        <div className="flex justify-end">
          <SubmitButton>Save preferences</SubmitButton>
        </div>
      </ActionForm>
      {stack ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Company stack</h2>
          <StackCard ctx={stack} />
        </div>
      ) : null}

      <div className="mt-8" id="api">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">API &amp; MCP</h2>
        <p className="mb-3 text-sm text-slate-600">
          Use {BRAND} from Claude, ChatGPT, Cursor or any MCP-compatible tool. Keys act as you, with your current workspace role. Server URL:{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{mcpUrl}</code>
        </p>
        <Card className="space-y-5 p-6">
          <CreateApiKeyForm workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} mcpUrl={mcpUrl} />
          {keys.length ? (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {keys.map(({ key, orgName }) => (
                <li key={key.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{key.name}</div>
                    <div className="text-xs text-slate-500">
                      <code>{key.prefix}…</code> · {orgName ?? "News only"} · created {formatDate(key.createdAt)} ·{" "}
                      {key.lastUsedAt ? `last used ${timeAgo(key.lastUsedAt)}` : "never used"}
                    </div>
                  </div>
                  <Badge tone={key.scopes.includes("write") ? "amber" : "neutral"}>{key.scopes.includes("write") ? "Read & write" : "Read only"}</Badge>
                  <form action={revokeKeyAction}>
                    <input type="hidden" name="id" value={key.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50">
                      Revoke
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <details className="text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">Available tools ({TOOL_CATALOG.length})</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {TOOL_CATALOG.map((t) => (
                <li key={t.name}>
                  <code className="text-xs">{t.name}</code>
                  <span className="text-xs text-slate-400">
                    {" "}
                    · {t.scope === "workspace" ? "workspace key" : "any key"}
                    {t.write ? " · read & write" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      </div>
    </div>
  );
}
