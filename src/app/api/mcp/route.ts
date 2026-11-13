import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { appUrl } from "@/lib/env";
import { verifyApiKey } from "@/lib/mcp/keys";
import { registerRadarTools } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerRadarTools(server);
  },
  {
    serverInfo: { name: "ai-radar", version: "1.0.0" },
    instructions:
      "AI Radar by North Labs. Use radar_* tools for curated, deduplicated AI news, the user's company stack and upcoming deadlines. " +
      "Use workspace_* tools for the connected company's AI initiative portfolio (priorities, impact, ideas, governance). " +
      "Workspace tools need a workspace-scoped key; write tools need a read-write key.",
  },
);

/** API keys created in AI Radar → Settings → API & MCP. Sent as `Authorization: Bearer radar_…`. */
const authed = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    const key = await verifyApiKey(bearerToken);
    if (!key) return undefined;
    return { token: bearerToken!, clientId: key.id, scopes: key.scopes, extra: { keyId: key.id, userId: key.userId } };
  },
  { required: true, resourceUrl: appUrl() },
);

export { authed as GET, authed as POST, authed as DELETE };
