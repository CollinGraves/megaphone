# AI Radar by North Labs

AI Radar does two jobs:

1. **Radar Feed** (free, generates leads): a personalized feed and email digest of AI news. Sources include vendor
   newsrooms, research, regulators, trade press and community sites. Duplicate coverage is merged into one story, and
   each story is classified, summarized and ranked. A public, search-indexable "Top stories" site brings in organic
   traffic. Every signup gives North Labs a qualified lead (company, title, industry, size, interests, engagement).
2. **Radar Workspace** (paid, provisioned by North Labs): a client company's single source of truth for its AI
   initiatives on any platform. It tracks what each initiative solves, its priority, its business impact (hours saved,
   cost saved, revenue, custom metrics, estimated vs. actual), and the systems and data it depends on. Radar news that
   affects a vendor in the client's stack (pricing changes, deprecations, security issues…) is flagged on the
   initiatives that use that vendor.

North Labs staff use the **Admin console** to work leads, provision workspaces, assign consultants, and run the
ingestion pipeline.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4 |
| Database | Postgres via Drizzle ORM. Production: Supabase (use the pooled connection string) |
| Auth | Better Auth (email + password), sessions stored in Postgres |
| AI | Claude (Anthropic SDK, structured outputs) for story deduplication, classification and summaries. Falls back to a keyword classifier when no API key is set |
| Email | Resend (falls back to logging emails to the server console) |
| Jobs | Vercel Cron → `/api/cron/ingest` (hourly) and `/api/cron/digest` (daily) |
| Hosting | Vercel |

## Getting started (local)

```bash
cp .env.example .env.local        # then fill in values
npm install
npm run db:migrate                # create tables
npm run db:seed                   # load the starter source registry
npm run ingest                    # fetch + process news (takes ~20s)
npm run db:seed-demo              # optional: demo client workspace + demo users
npm run dev
```

Users whose email is listed in `PLATFORM_ADMIN_EMAILS` become North Labs admins when they sign up.

Demo logins (after `db:seed-demo`; password `radar-demo-123`): `consultant@northlabs.io` (consultant assigned to
Acme), `owner@acme.example`, `editor@acme.example`, `viewer@acme.example`. The demo workspace is at `/w/acme`.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run ingest` | Fetch all active sources, then deduplicate/classify new articles. `-- --skip-fetch` processes only |
| `npm run digest` | Send digests that are due. `-- --force` sends to everyone subscribed (emails are logged without `RESEND_API_KEY`) |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Regenerate Next route types and run `tsc` |

## Deploying (Vercel + Supabase)

1. Create a Supabase project and copy the **transaction pooler** connection string (port 6543) into `DATABASE_URL`.
2. Run `npm run db:migrate` and `npm run db:seed` against it once (locally, with `DATABASE_URL` pointed at Supabase).
3. Import the repo into Vercel and set the environment variables from `.env.example`: `DATABASE_URL`,
   `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`,
   `PLATFORM_ADMIN_EMAILS`, and optionally `CONTACT_NOTIFY_EMAIL` (who gets "Talk to North Labs" submissions).
4. `vercel.json` registers the cron jobs. Vercel sends `CRON_SECRET` automatically.
5. Verify the sending domain in Resend so digests and invitations are delivered.

## How it fits together

```
src/
  app/
    page.tsx                  landing page
    (public)/radar/…          public, SEO-indexed stories, topics, vendors
    (public)/contact          "Talk to North Labs" lead form
    (auth)/sign-in|sign-up
    (app)/onboarding          captures lead profile + interests
    (app)/feed, settings      personalized feed, preferences, saved stories
    (app)/w/[slug]/…          client Workspace
    (app)/admin/…             North Labs admin console
    invite/[token]            workspace invitations
    api/cron/{ingest,digest}  scheduled jobs (Bearer CRON_SECRET)
    r/[storyId], api/t/open   click + open tracking
  db/schema.ts                single source of truth for the data model
  lib/ingest/                 fetch → parse → dedupe/classify → alerts
  lib/permissions.ts          role → capability matrix
  lib/workspace.ts            tenant resolution + capability guards
  lib/digest.ts               digest selection, rendering, scheduling
  proxy.ts                    optimistic auth redirect
```

### Ingestion pipeline (`src/lib/ingest`)

1. **Fetch**: every active source (RSS 2.0, RSS 1.0/RDF, Atom, or sitemap + page metadata for sites without feeds).
   Only items from the last 14 days are kept, tracking parameters are stripped from URLs, and new articles are stored
   (deduplicated by URL). Sources marked as general-purpose (`aiOnly = false`) are filtered by AI keywords.
2. **Process**: unprocessed articles go to Claude in batches of 25 together with the last 4 days of stories. The model
   decides relevance, merges duplicate coverage into existing stories or groups new articles into new stories, and
   writes a neutral headline, summary, "why it matters", categories, vendors, industries and a 1–5 importance score.
   Importance is then nudged up by coverage breadth and first-party authority. Without an API key (or if a call
   fails), a keyword classifier and headline-similarity matcher take over.
3. **Alerts**: stories with importance ≥ 3 in pricing, deprecation, security, model release or regulation that
   mention a vendor an active initiative is built on create alerts in that client's workspace.

The model defaults to `claude-opus-5-5` at low effort, with server-side refusal fallbacks enabled. Override it with
`AI_RADAR_MODEL`; for high-volume ingestion, Claude Haiku 5.5 (`claude-haiku-5-5`) is much cheaper.

Source health (last success, errors, consecutive failures) is visible in **Admin → Sources**. Some publishers
(e.g. Reddit, The Verge, Wired) block some cloud IP ranges. Those sources show up as failing rather than being silently
dropped.

### Permissions

Two layers, enforced on the server in every page and server action:

- **Platform role** (`user.platformRole`): `admin` (North Labs: everything, acts as owner in every workspace),
  `consultant` (North Labs: acts as workspace admin in client workspaces they're assigned to), `user`.
- **Workspace role** (`memberships.role`): `owner` > `admin` > `editor` > `viewer`. See `src/lib/permissions.ts` for
  the capability matrix. Only owners can grant or remove ownership, and a workspace always keeps at least one owner.

Workspaces are tenant-isolated: every query is scoped by `orgId` after `getWorkspaceOrNotFound` /
`requireWorkspaceCapability`, and IDs submitted in forms are verified against the current workspace.

### Lead capture

- Sign-up → onboarding (company, title, industry, size, interests) → `lead_profiles` row + `engagement_events`.
- Tracked events: signup, onboarded, story views, outbound clicks (`/r/:id`), digest opens (pixel) and clicks
  (signed links), CTA clicks, contact requests.
- **Admin → Leads** scores and ranks leads and exports them as CSV. A direct CRM integration can be added later
  (custom CRM: likely an outbound webhook on lead events).

### Business-account capture

The free product is built to bring in **work emails** so every lead maps to a company:

- **Email-first sign-up** on the landing page with live feedback: work emails are confirmed ("we'll tailor it for
  Acme"), personal addresses get a nudge and an explicit "I don't have a work email" step, and disposable addresses are
  rejected on the server. Set `REQUIRE_WORK_EMAIL=true` to block personal addresses entirely.
- **Company accounts** (`companies`, keyed by email domain) are created on sign-up. Onboarding is prefilled from the
  domain, so business users finish faster than personal-email users.
- **Enrichment** is provider-agnostic. New domains are POSTed to `ENRICHMENT_WEBHOOK_URL` (e.g. a Clay table webhook),
  and the provider posts results (company size, industry, HQ, LinkedIn, other contacts) to
  `POST /api/integrations/enrichment` with `Authorization: Bearer $ENRICHMENT_API_SECRET`.
- **Colleague invites** from the feed are limited to the inviter's own domain (max 5 per send, 20 per day) and
  attributed via `user.referredById`.
- **Email verification** is sent on sign-up but not required; unverified users see a reminder in their feed.
- **Admin → Accounts** shows each company with its people, hottest lead, enriched contacts (CSV export), the 30-day
  work-email rate and sign-ups by source (every sign-up link carries a `src`).

Run `npm run db:backfill-companies` once after deploying to tag existing users with their company domain.

Enriched contacts are for North Labs' own outreach and are never emailed by AI Radar. Check your outreach against
CAN-SPAM, GDPR and similar rules for the regions you sell into.

### Company graph (temporal)

AI Radar keeps a small time-aware knowledge graph in Postgres (`src/lib/graph`):

- **Entities**: vendors, products, models, companies and regulations, plus which stories mention them (`story_entities`).
- **Facts with validity**: prices, retirement/deprecation dates, regulatory effective dates, GA dates, adoptions and
  replacements (`entity_facts`). A newer fact for the same subject/predicate closes the old one (`valid_to`,
  `superseded_by_id`) and links the two stories as an arc (`story_links`).
- **Extraction**: Claude extracts entities, facts (only explicitly stated ones, with stated dates) and follow-up
  links in the same structured call that classifies each story. The keyword fallback links vendor entities only, so
  deadlines and arcs require `ANTHROPIC_API_KEY`.
- **Company stacks** (`company_stack`, per email domain): inferred from enrichment technographics
  (`technologies` in the enrichment payload), the company's Workspace platforms and systems, and vendors followed by
  2+ colleagues (aggregate only, never attributed). Anyone at the company can confirm, remove or add tools. Human
  decisions are never overwritten by re-inference.
- **What readers see**: "Because Acme uses Salesforce" on matching stories (feed, story pages, digest),
  stack-aware feed and digest selection, an upcoming-deadlines card and digest block (with a "Heads up" subject line
  when a stack deadline is ≤14 days away), and a timeline on each story page showing current vs. superseded facts.

After deploying: `npm run db:backfill-graph` links existing stories and computes stacks (ingestion keeps them fresh).
`npm run db:seed-graph-demo` adds clearly-labelled fictional demo stories locally (it refuses non-local databases).

### Single sign-on

"Continue with Google Workspace" and "Continue with Microsoft 365" appear on sign-in and sign-up. Each turns on
when its client ID and secret are set (see `.env.example`). Until then it shows as coming soon. Microsoft defaults to
work and school accounts only. The same email rules apply as for the email form (disposable addresses blocked;
personal ones blocked if `REQUIRE_WORK_EMAIL=true`), and an existing account with the same verified email is linked
rather than duplicated.

### MCP server (use AI Radar from Claude, Cursor, ChatGPT…)

`/api/mcp` is a remote [Model Context Protocol](https://modelcontextprotocol.io) server (Streamable HTTP, via
`mcp-handler`). People create API keys in **Settings → API & MCP**:

- A key acts as its user. It can optionally be connected to one workspace and is read-only or read-write.
- Only a SHA-256 hash is stored, and the key is shown once.
- On every call the user's *current* workspace role is re-checked, so removing someone from a workspace immediately
  cuts their key's workspace access. Revoked keys get `401`.

Tools:

| Tool | Needs |
|---|---|
| `radar_search_stories`, `radar_top_stories`, `radar_get_story` | any key |
| `radar_my_company` (company stack + upcoming deadlines) | any key |
| `workspace_portfolio_summary`, `workspace_list_initiatives`, `workspace_get_initiative` | workspace key |
| `workspace_list_ideas`, `workspace_radar_alerts`, `workspace_governance_register` | workspace key |
| `workspace_submit_idea` | workspace key, read-write, `ideas:submit` |
| `workspace_record_impact` | workspace key, read-write, `impact:write` |

Connect from Claude Code with
`claude mcp add --transport http ai-radar https://<app>/api/mcp --header "Authorization: Bearer radar_…"`, or from
stdio clients via `npx mcp-remote <url> --header "Authorization: Bearer radar_…"` (the settings page generates both).
claude.ai and ChatGPT "custom connectors" need OAuth rather than a static key; that's a follow-up (see roadmap).

## Roadmap / next steps

- Self-serve Workspace sign-up with Stripe billing (`organizations.plan`, `stripe*` columns are already reserved).
- CRM sync (webhook or API) for leads and engagement.
- SAML SSO for enterprise workspaces (Google/Microsoft OAuth is in place; Better Auth has an SSO plugin for SAML).
- OAuth for the MCP server (so it can be added as a claude.ai / ChatGPT connector without pasting a key) and per-key
  rate limits.
- Peer signals from the graph ("3 manufacturers your size adopted X this quarter").
- Slack/Teams delivery for digests and initiative alerts.
- A broader news API (e.g. Event Registry or NewsAPI) to extend coverage beyond the curated registry.
- Embedding-based deduplication (pgvector on Supabase) if volume outgrows the LLM batch approach.
