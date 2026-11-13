"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { createKeyAction, type CreateKeyState } from "@/app/(app)/settings/api-key-actions";
import { Alert, Button, Field, Input, Select } from "./ui";

function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-md bg-ink-900 px-3 py-2 font-mono text-xs text-slate-100">{value}</code>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        aria-label={label ?? "Copy"}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export function CreateApiKeyForm({ workspaces, mcpUrl }: { workspaces: { id: string; name: string }[]; mcpUrl: string }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createKeyAction, null);
  return (
    <div className="space-y-4">
      {state?.key ? (
        <Alert tone="success" className="space-y-3">
          <div className="font-medium">“{state.name}” created. Copy it now: it won&apos;t be shown again.</div>
          <CopyField value={state.key} label="Copy API key" />
          <div className="space-y-2 text-xs text-slate-700">
            <div className="font-medium">Claude Code</div>
            <CopyField value={`claude mcp add --transport http ai-radar ${mcpUrl} --header "Authorization: Bearer ${state.key}"`} />
            <div className="font-medium">Claude Desktop, Cursor and other clients (via mcp-remote)</div>
            <CopyField
              value={JSON.stringify(
                { mcpServers: { "ai-radar": { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", `Authorization: Bearer ${state.key}`] } } },
                null,
                2,
              )}
            />
          </div>
        </Alert>
      ) : null}
      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <Field label="Key name" htmlFor="key-name">
          <Input id="key-name" name="name" placeholder="e.g. Claude Desktop" required maxLength={60} />
        </Field>
        <Field label="Workspace" htmlFor="key-org">
          <Select id="key-org" name="orgId" defaultValue={workspaces[0]?.id ?? ""}>
            <option value="">None (news tools only)</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Access" htmlFor="key-access">
          <Select id="key-access" name="access" defaultValue="read">
            <option value="read">Read only</option>
            <option value="write">Read &amp; write</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          <KeyRound className="size-4" /> {pending ? "Creating…" : "Create key"}
        </Button>
      </form>
    </div>
  );
}
