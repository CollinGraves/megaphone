/**
 * Everything the brief generator knows about an initiative and its company. Pure type + formatter
 * (the loader lives in server.ts) so the prompt and the template fallback share one shape.
 */
export type BriefContext = {
  org: { name: string; industry: string | null; defaultHourlyRate: number };
  initiative: {
    title: string;
    problem: string;
    solution: string;
    businessUnit: string | null;
    stage: string;
    platforms: string[];
    models: string[];
    buildApproach: string | null;
    riskTier: string;
    customerFacing: boolean | null;
    affectsIndividuals: boolean | null;
    humanOversight: string | null;
    targetDate: string | null;
  };
  metrics: { name: string; type: string; unit: string; period: string; estimatedValue: number | null; assumptions: string | null }[];
  dependencies: { system: string; category: string; vendor: string | null; data: string; access: string; sensitivity: string }[];
  /** Platforms used anywhere in the portfolio and systems in the catalog = the company's working stack. */
  portfolioPlatforms: string[];
  systems: { name: string; category: string; vendor: string | null }[];
  /** Company stack from the knowledge graph (confirmed / inferred tools), when known. */
  stack: string[];
  guidance: string | null;
};

const list = (xs: readonly string[]) => (xs.length ? xs.join(", ") : "none recorded");

export function formatContext(c: BriefContext): string {
  const i = c.initiative;
  return `<company>
Name: ${c.org.name}
Industry: ${c.org.industry ?? "unknown"}
Platforms already used across the AI portfolio: ${list(c.portfolioPlatforms)}
Systems of record: ${c.systems.length ? c.systems.map((s) => `${s.name} (${s.category}${s.vendor ? `, ${s.vendor}` : ""})`).join("; ") : "none recorded"}
Known tools (company stack): ${list(c.stack)}
Loaded hourly cost for time savings: $${c.org.defaultHourlyRate}
</company>

<initiative>
Title: ${i.title}
Business unit: ${i.businessUnit ?? "—"}
Stage: ${i.stage}
Problem: ${i.problem || "—"}
Proposed solution: ${i.solution || "—"}
Platforms chosen so far: ${list(i.platforms)}
Models/products mentioned: ${list(i.models)}
Build approach preference: ${i.buildApproach ?? "none"}
Target date: ${i.targetDate ?? "none"}
</initiative>

<governance>
Risk tier: ${i.riskTier}
Customer-facing: ${i.customerFacing == null ? "unknown" : i.customerFacing ? "yes" : "no"}
Makes or informs decisions about individuals: ${i.affectsIndividuals == null ? "unknown" : i.affectsIndividuals ? "yes" : "no"}
Human oversight: ${i.humanOversight ?? "not decided"}
</governance>

<impact_estimates>
${c.metrics.length ? c.metrics.map((m) => `- ${m.name} (${m.type}): ${m.estimatedValue ?? "?"} ${m.unit} ${m.period}${m.assumptions ? ` — assumptions: ${m.assumptions}` : ""}`).join("\n") : "none recorded"}
</impact_estimates>

<data_dependencies>
${c.dependencies.length ? c.dependencies.map((d) => `- ${d.system} (${d.category}): ${d.data} · access ${d.access} · sensitivity ${d.sensitivity}`).join("\n") : "none recorded"}
</data_dependencies>
${c.guidance ? `\n<requester_guidance>\n${c.guidance}\n</requester_guidance>` : ""}`;
}
