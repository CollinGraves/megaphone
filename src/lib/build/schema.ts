import { z } from "zod";

/**
 * A build brief: everything needed to go from an initiative to something working.
 * Used as the structured-output schema for Claude, for rendering, Markdown export and MCP.
 */

export const APPROACHES = ["configure", "low_code", "custom_build", "buy"] as const;
export const EFFORTS = ["S", "M", "L"] as const;

export const APPROACH_LABELS: Record<(typeof APPROACHES)[number], string> = {
  configure: "Configure a tool you already have",
  low_code: "Low-code / workflow automation",
  custom_build: "Custom build",
  buy: "Buy a specialized product",
};
export const EFFORT_LABELS: Record<(typeof EFFORTS)[number], string> = { S: "Small (days)", M: "Medium (weeks)", L: "Large (1–3 months)" };

export const BuildBriefSchema = z.object({
  summary: z.string().describe("2–3 sentences: what will be built, for whom, and the expected outcome."),
  recommended_option: z.number().int().min(0).describe("Index into options of the recommended approach."),
  options: z
    .array(
      z.object({
        name: z.string().describe("Short name, e.g. 'Copilot Studio agent with Salesforce connector'."),
        platform: z.string().describe("Primary platform/product, e.g. 'Microsoft Copilot Studio', 'Claude (Anthropic API)', 'n8n'."),
        approach: z.enum(APPROACHES),
        why: z.string().describe("Why this fits THIS company (their stack, data, skills, risk tier)."),
        components: z.array(z.string()).describe("Concrete building blocks (connectors, models, services)."),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        effort: z.enum(EFFORTS),
        cost_notes: z.string().describe("Licensing / usage cost considerations, qualitative unless the inputs give numbers."),
      }),
    )
    .min(1)
    .max(3),
  requirements: z.object({
    functional: z.array(z.string()),
    non_functional: z.array(z.string()).describe("Security, privacy, latency, availability, compliance."),
  }),
  data_plan: z.array(
    z.object({
      system: z.string(),
      data: z.string(),
      access: z.string().describe("What access is needed and its current status if known."),
      handling: z.string().describe("How to handle it safely given its sensitivity (masking, least privilege, retention)."),
    }),
  ),
  workflow: z.array(z.string()).describe("The end-to-end steps of the solution, in order."),
  ai_design: z.object({
    system_prompt: z.string().describe("A ready-to-use draft system prompt/instructions for the AI component."),
    knowledge_sources: z.array(z.string()),
    integrations: z.array(z.string()).describe("Tools/actions the AI needs (e.g. 'read Salesforce case', 'create Jira ticket')."),
    guardrails: z.array(z.string()),
    human_oversight: z.string().describe("Where a person reviews or decides, matched to the risk tier."),
  }),
  evaluation: z.object({
    success_metrics: z.array(z.string()),
    test_cases: z
      .array(z.object({ scenario: z.string(), input: z.string(), expected: z.string() }))
      .describe("5–8 realistic test cases (synthetic, no real personal data)."),
    acceptance_criteria: z.array(z.string()),
  }),
  risks: z.array(z.object({ risk: z.string(), mitigation: z.string() })),
  rollout: z.array(z.object({ phase: z.string(), duration: z.string(), goal: z.string() })),
  open_questions: z.array(z.string()),
  tickets: z
    .array(z.object({ title: z.string(), description: z.string(), acceptance: z.array(z.string()), estimate: z.enum(EFFORTS) }))
    .describe("Developer-ready work items for the recommended option, in build order (6–12)."),
});

export type BuildBrief = z.infer<typeof BuildBriefSchema>;

export function parseBrief(content: unknown): BuildBrief | null {
  const parsed = BuildBriefSchema.safeParse(content);
  if (!parsed.success) return null;
  const b = parsed.data;
  return { ...b, recommended_option: Math.min(b.recommended_option, b.options.length - 1) };
}
