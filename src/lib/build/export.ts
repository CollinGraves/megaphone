import { APPROACH_LABELS, EFFORT_LABELS, type BuildBrief } from "./schema";

const bullets = (xs: readonly string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- _None_");

/** The brief as Markdown — for download, copy/paste into docs, and for coding agents over MCP. */
export function briefToMarkdown(b: BuildBrief, meta: { title: string; workspace: string; version: number; url?: string }): string {
  const rec = b.options[b.recommended_option];
  return [
    `# Build brief: ${meta.title}`,
    `_${meta.workspace} · version ${meta.version}${meta.url ? ` · ${meta.url}` : ""}_`,
    "",
    "## Summary",
    b.summary,
    "",
    `## Recommended approach: ${rec.name}`,
    `**Platform:** ${rec.platform} · **Approach:** ${APPROACH_LABELS[rec.approach]} · **Effort:** ${EFFORT_LABELS[rec.effort]}`,
    "",
    rec.why,
    "",
    "**Components**",
    bullets(rec.components),
    "",
    "## Options considered",
    ...b.options.flatMap((o, i) => [
      `### ${i === b.recommended_option ? "★ " : ""}${o.name}`,
      `${o.platform} · ${APPROACH_LABELS[o.approach]} · effort ${o.effort}`,
      "",
      o.why,
      "",
      `**Pros:** ${o.pros.join("; ")}`,
      `**Cons:** ${o.cons.join("; ")}`,
      `**Cost:** ${o.cost_notes}`,
      "",
    ]),
    "## Requirements",
    "**Functional**",
    bullets(b.requirements.functional),
    "",
    "**Non-functional**",
    bullets(b.requirements.non_functional),
    "",
    "## Data plan",
    b.data_plan.length
      ? ["| System | Data | Access | Handling |", "|---|---|---|---|", ...b.data_plan.map((d) => `| ${d.system} | ${d.data} | ${d.access} | ${d.handling} |`)].join("\n")
      : "_No data dependencies recorded._",
    "",
    "## Workflow",
    b.workflow.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    "",
    "## AI design",
    "**System prompt (draft)**",
    "```",
    b.ai_design.system_prompt,
    "```",
    "",
    "**Knowledge sources**",
    bullets(b.ai_design.knowledge_sources),
    "",
    "**Integrations / tools**",
    bullets(b.ai_design.integrations),
    "",
    "**Guardrails**",
    bullets(b.ai_design.guardrails),
    "",
    `**Human oversight:** ${b.ai_design.human_oversight}`,
    "",
    "## Evaluation",
    "**Success metrics**",
    bullets(b.evaluation.success_metrics),
    "",
    "**Test cases**",
    ["| Scenario | Input | Expected |", "|---|---|---|", ...b.evaluation.test_cases.map((t) => `| ${t.scenario} | ${t.input} | ${t.expected} |`)].join("\n"),
    "",
    "**Acceptance criteria**",
    bullets(b.evaluation.acceptance_criteria),
    "",
    "## Risks",
    b.risks.map((r) => `- **${r.risk}** — ${r.mitigation}`).join("\n") || "- _None_",
    "",
    "## Rollout",
    b.rollout.map((r) => `- **${r.phase}** (${r.duration}): ${r.goal}`).join("\n"),
    "",
    "## Open questions",
    bullets(b.open_questions),
    "",
    "## Work items",
    ...b.tickets.map((t, i) => `${i + 1}. **${t.title}** (${t.estimate}) — ${t.description}\n   - Done when: ${t.acceptance.join("; ")}`),
    "",
  ].join("\n");
}

const csvCell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Jira's CSV importer format (Summary, Description, Issue Type, Labels, Original Estimate). */
export function ticketsToJiraCsv(b: BuildBrief, label: string): string {
  const hours = { S: "8h", M: "24h", L: "80h" } as const;
  const rows = b.tickets.map((t) =>
    [t.title, `${t.description}\n\nAcceptance criteria:\n${t.acceptance.map((a) => `* ${a}`).join("\n")}`, "Task", label, hours[t.estimate]].map(csvCell).join(","),
  );
  return ["Summary,Description,Issue Type,Labels,Original Estimate", ...rows].join("\r\n") + "\r\n";
}
