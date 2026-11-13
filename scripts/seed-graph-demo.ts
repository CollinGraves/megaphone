import "./load-env";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { stories, user } from "@/db/schema";
import { ensureCompany } from "@/lib/enrichment";
import { recordStoryGraph, type GraphExtraction } from "@/lib/graph/entities";
import { addStackItem, refreshCompanyStack } from "@/lib/graph/stack";

/**
 * LOCAL DEMO ONLY. Creates clearly-labelled fictional stories ("[Demo] …", fictional products) and runs them
 * through the same graph code the ingestion pipeline uses, so deadlines, superseded facts, story arcs and
 * "Because Acme uses …" can be seen without a model API key. Refuses to run against non-local databases.
 */
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) && !process.argv.includes("--force")) {
    console.error("Refusing to seed demo graph data into a non-local database.");
    process.exit(1);
  }
  await db.delete(stories).where(like(stories.slug, "demo-%"));

  const make = async (slug: string, title: string, summary: string, daysAgo: number, categories: string[], extraction: GraphExtraction) => {
    const [s] = await db
      .insert(stories)
      .values({
        slug,
        title: `[Demo] ${title}`,
        summary,
        whyItMatters: "Demo data to illustrate the knowledge graph. Not a real announcement.",
        categories,
        vendors: [],
        importance: 4,
        primaryUrl: "https://example.com/ai-radar-demo",
        primarySourceName: "AI Radar demo data",
        classifiedBy: "llm",
        publishedAt: new Date(Date.now() - daysAgo * 864e5),
      })
      .returning();
    await recordStoryGraph(s.id, [], extraction);
    return s;
  };

  const launch = await make(
    "demo-atlas-assistant-launch",
    "Northwind launches Atlas Assistant for finance teams",
    "Fictional vendor Northwind releases Atlas Assistant, priced at $30 per user per month.",
    40,
    ["product_launch", "pricing"],
    {
      entities: [{ name: "Atlas Assistant", kind: "product" }, { name: "Northwind AI", kind: "company" }],
      facts: [{ subject: "Atlas Assistant", predicate: "price", value: "$30 / user / month" }],
    },
  );
  await make(
    "demo-atlas-assistant-price-cut",
    "Northwind cuts Atlas Assistant price and announces v1 retirement",
    "Atlas Assistant drops to $18 per user per month. The v1 API will be retired; customers must migrate to v2.",
    3,
    ["pricing", "deprecation"],
    {
      entities: [{ name: "Atlas Assistant", kind: "product" }, { name: "Atlas Assistant v1 API", kind: "product" }],
      facts: [
        { subject: "Atlas Assistant", predicate: "price", value: "$18 / user / month" },
        { subject: "Atlas Assistant v1 API", predicate: "retires_on", effective_date: day(21) },
      ],
      followsUpStoryId: launch.id,
    },
  );
  await make(
    "demo-transparency-rule",
    "Demo AI Transparency Rule obligations begin",
    "A fictional regulation requiring disclosure of AI-generated customer communications takes effect.",
    6,
    ["regulation"],
    {
      entities: [{ name: "Demo AI Transparency Rule", kind: "regulation" }],
      facts: [{ subject: "Demo AI Transparency Rule", predicate: "effective_on", effective_date: day(60) }],
    },
  );

  // Put the fictional product in Acme's stack so the demo company sees personalization.
  const [owner] = await db.select().from(user).where(eq(user.email, "owner@acme.example")).limit(1);
  if (owner?.companyDomain) {
    await ensureCompany(owner.companyDomain);
    await refreshCompanyStack(owner.companyDomain);
    await addStackItem(owner.companyDomain, "Atlas Assistant", owner.id);
    await addStackItem(owner.companyDomain, "Atlas Assistant v1 API", owner.id);
  }
  console.log("[graph-demo] seeded demo stories, facts and Acme stack");
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
