import type { BriefContext } from "./context";
import type { BuildBrief } from "./schema";

/**
 * Deterministic brief used when no model API key is configured (and in tests). It applies the same
 * reasoning rules a consultant would — prefer tools the company already runs, step up to low-code or a
 * custom build when risk, data or integration needs demand it — but with generic wording.
 */

const has = (c: BriefContext, ...needles: string[]) => {
  const hay = [...c.portfolioPlatforms, ...c.initiative.platforms, ...c.stack, ...c.systems.map((s) => `${s.name} ${s.vendor ?? ""}`), ...c.initiative.models]
    .join(" ")
    .toLowerCase();
  return needles.some((n) => hay.includes(n));
};

export function templateBrief(c: BriefContext): BuildBrief {
  const i = c.initiative;
  const ms = has(c, "microsoft", "copilot", "m365", "microsoft 365", "azure", "sharepoint", "teams");
  const anthropic = has(c, "anthropic", "claude");
  const openai = has(c, "openai", "chatgpt", "gpt");
  const google = has(c, "google", "gemini", "workspace");
  const highRisk = i.riskTier === "high" || i.affectsIndividuals === true;
  const sensitive = c.dependencies.some((d) => ["pii", "phi", "pci"].includes(d.sensitivity));
  const integrationHeavy = c.dependencies.length >= 2;
  const systemsList = c.dependencies.map((d) => d.system);

  const configure = ms
    ? { name: "Copilot Studio agent", platform: "Microsoft Copilot Studio", components: ["Copilot Studio agent", "Microsoft 365 knowledge (SharePoint/Teams)", ...systemsList.map((s) => `${s} connector`)] }
    : openai
      ? { name: "Custom GPT for the team", platform: "ChatGPT Enterprise / Team", components: ["Custom GPT", "Uploaded knowledge files", ...systemsList.map((s) => `${s} action (API)`)] }
      : anthropic
        ? { name: "Claude Project for the team", platform: "Claude (Team / Enterprise)", components: ["Claude Project", "Project knowledge", ...systemsList.map((s) => `${s} via MCP connector`)] }
        : google
          ? { name: "Gemini Gem", platform: "Gemini for Google Workspace", components: ["Gemini Gem", "Drive knowledge", ...systemsList.map((s) => `${s} integration`)] }
          : { name: "Assistant in your existing AI tool", platform: "Your company's AI assistant", components: ["Shared assistant / project", "Curated knowledge", ...systemsList] };
  const apiPlatform = anthropic ? "Claude (Anthropic API)" : openai ? "OpenAI API" : ms ? "Azure AI Foundry" : google ? "Vertex AI" : "Claude (Anthropic API)";
  const lowCodePlatform = ms ? "Power Automate" : "n8n";

  const options: BuildBrief["options"] = [
    {
      name: configure.name,
      platform: configure.platform,
      approach: "configure",
      why: `Uses a tool the company already pays for, so it can be piloted in days with no new infrastructure.`,
      components: configure.components,
      pros: ["Fastest path to a pilot", "No new vendor or hosting", "Users stay in tools they know"],
      cons: ["Limited control over workflow and logging", integrationHeavy ? "Integrations with several systems may be constrained" : "Harder to automate end to end"],
      effort: "S",
      cost_notes: "Mostly existing licences; check per-user add-on costs.",
    },
    {
      name: `Automated workflow with ${apiPlatform}`,
      platform: `${lowCodePlatform} + ${apiPlatform}`,
      approach: "low_code",
      why: `Runs the process end to end across ${systemsList.length ? systemsList.join(", ") : "the systems involved"} with a review step where needed.`,
      components: [lowCodePlatform, apiPlatform, ...systemsList.map((s) => `${s} connector`), "Review queue"],
      pros: ["Automates the whole flow", "Built-in run history and retries", "Clear place for human review"],
      cons: ["Needs an owner to maintain flows", "Usage-based model costs"],
      effort: "M",
      cost_notes: "Workflow tool licence plus model usage per run.",
    },
    {
      name: `Custom service on ${apiPlatform}`,
      platform: apiPlatform,
      approach: "custom_build",
      why: "Full control over data handling, evaluation and integration, for when the workflow is core or risk is high.",
      components: [apiPlatform, "Small API service", "Evaluation suite", "Audit logging", ...systemsList.map((s) => `${s} integration`)],
      pros: ["Full control and observability", "Easiest to evaluate rigorously", "Can enforce strict data handling"],
      cons: ["Engineering time to build and run", "Needs monitoring and ownership"],
      effort: "L",
      cost_notes: "Engineering effort plus model usage and hosting.",
    },
  ];
  const recommended = highRisk || sensitive ? (integrationHeavy ? 2 : 1) : integrationHeavy ? 1 : 0;

  return {
    summary: `Build "${i.title}" for ${i.businessUnit ?? "the team"}: ${i.problem ? i.problem.split(/(?<=\.)\s/)[0] : "solve the problem described in the initiative."} Recommended path: ${options[recommended].name}. (Template brief — add an Anthropic API key for a brief tailored by AI.)`,
    recommended_option: recommended,
    options,
    requirements: {
      functional: [
        `Handle the core task described: ${i.solution || i.problem || i.title}`,
        ...c.dependencies.map((d) => `Read ${d.data} from ${d.system}`),
        "Show sources or reasoning for each output so users can check it",
      ],
      non_functional: [
        sensitive ? "Mask or minimize regulated data (PII/PHI/PCI) before it reaches the model" : "Only send the data needed for each task to the model",
        "Log inputs, outputs and reviewer decisions for audit",
        "Respond fast enough to fit the existing workflow",
      ],
    },
    data_plan: c.dependencies.map((d) => ({
      system: d.system,
      data: d.data,
      access: `Read access needed (currently: ${d.access.replace(/_/g, " ")})`,
      handling: ["pii", "phi", "pci"].includes(d.sensitivity) ? "Least-privilege service account; mask identifiers; no retention by the model vendor" : "Least-privilege service account; read only",
    })),
    workflow: ["Trigger: a new item arrives or a user asks", "Gather the relevant data from the systems above", "AI drafts the output", highRisk ? "A person reviews and decides" : i.customerFacing ? "A person reviews before anything reaches a customer" : "A person spot-checks", "Result is saved back and logged"],
    ai_design: {
      system_prompt: `You help the ${i.businessUnit ?? "team"} at ${c.org.name} with: ${i.title}.\n\nGoal: ${i.solution || i.problem}\n\nRules:\n- Use only the information provided; say when something is missing.\n- Explain your reasoning briefly and cite the source records.\n- Never invent figures, names or policies.${highRisk ? "\n- Flag anything that affects an individual for human review." : ""}`,
      knowledge_sources: c.dependencies.map((d) => `${d.data} (${d.system})`),
      integrations: c.dependencies.map((d) => `Read from ${d.system}`),
      guardrails: ["Refuse requests outside this task", "Do not reveal data from other records", sensitive ? "Redact regulated identifiers in outputs" : "Keep outputs to the task"],
      human_oversight: highRisk ? "A person makes the final decision on every case." : i.customerFacing ? "A person reviews outputs before customers see them during the pilot." : "Spot-check a sample of outputs weekly.",
    },
    evaluation: {
      success_metrics: [
        ...c.metrics.map((m) => `${m.name}: reach ${m.estimatedValue ?? "the estimated"} ${m.unit} ${m.period}`),
        "Accuracy on the test set ≥ 90%",
        "Users rate outputs useful in ≥ 80% of cases",
      ],
      test_cases: [
        { scenario: "Typical case", input: "A representative, complete example", expected: "Correct, well-sourced output" },
        { scenario: "Missing data", input: "An example with a key field missing", expected: "Asks for or flags the missing information" },
        { scenario: "Ambiguous request", input: "An unclear or conflicting example", expected: "Explains the ambiguity rather than guessing" },
        { scenario: "Out of scope", input: "A request unrelated to the task", expected: "Politely declines" },
        { scenario: "Sensitive data", input: "An example containing personal details", expected: "Handles per the data plan; no leakage" },
      ],
      acceptance_criteria: ["Passes the test set at the target accuracy", "Reviewers sign off on a 2-week pilot", "Governance review approved for the pilot stage"],
    },
    risks: [
      { risk: "Outputs are wrong but sound confident", mitigation: "Cite sources; human review during the pilot; track error rate" },
      { risk: "Data access takes longer than expected", mitigation: "Request access in week 1; start with an export if needed" },
      { risk: "Low adoption", mitigation: "Embed in the existing workflow and pick pilot users who own the problem" },
    ],
    rollout: [
      { phase: "Prototype", duration: "1–2 weeks", goal: "Working version on test data, evaluated" },
      { phase: "Pilot", duration: "2–4 weeks", goal: "Small group uses it on real work; measure impact" },
      { phase: "Production", duration: "Ongoing", goal: "Roll out, monitor quality and record monthly actuals" },
    ],
    open_questions: ["Who owns this after launch?", "What volume per week should it handle?", ...c.dependencies.filter((d) => d.access !== "granted").map((d) => `When can access to ${d.system} be granted?`)],
    tickets: [
      { title: "Confirm scope and success metrics", description: "Agree the task boundaries, users and target metrics with the owner.", acceptance: ["Metrics recorded in the initiative"], estimate: "S" },
      ...c.dependencies.map((d) => ({ title: `Set up read access to ${d.system}`, description: `Service account with least privilege for: ${d.data}.`, acceptance: ["Access granted and documented", "Sensitivity handling agreed"], estimate: "S" as const })),
      { title: `Build first version (${options[recommended].name})`, description: "Implement the recommended option with the drafted prompt and integrations.", acceptance: ["Runs end to end on test data"], estimate: options[recommended].effort },
      { title: "Create the evaluation set and run it", description: "Turn the test cases into a repeatable evaluation.", acceptance: ["Accuracy measured and recorded"], estimate: "S" },
      { title: "Pilot with real users", description: "Run a 2–4 week pilot with review in place.", acceptance: ["Pilot feedback collected", "Impact actuals recorded"], estimate: "M" },
    ],
  };
}
