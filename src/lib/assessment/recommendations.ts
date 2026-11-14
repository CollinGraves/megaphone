/**
 * Rule-based recommendations: each dimension falls into a band, and each band has a headline and
 * concrete next steps. Deterministic and explainable: no model calls, no invented benchmarks.
 */
import { DIMENSIONS, type DimensionId } from "./questions";
import { rankDimensions } from "./scoring";

export type Band = "foundational" | "developing" | "strength";

/** Below 40: foundational gap. 40–69: developing. 70+: strength. */
export const BAND_THRESHOLDS = { developing: 40, strength: 70 } as const;

export function bandFor(score: number): Band {
  if (score >= BAND_THRESHOLDS.strength) return "strength";
  if (score >= BAND_THRESHOLDS.developing) return "developing";
  return "foundational";
}

export const BAND_LABELS: Record<Band, string> = {
  foundational: "Big gap",
  developing: "Getting there",
  strength: "Strength",
};

type Playbook = {
  strength: string;
  foundational: { headline: string; steps: string[] };
  developing: { headline: string; steps: string[] };
};

const PLAYBOOK: Record<DimensionId, Playbook> = {
  strategy: {
    strength: "Leaders own AI, with a plan and money tied to business goals.",
    foundational: {
      headline: "No leader owns AI yet, and it has no clear business goal",
      steps: [
        "Name one senior leader in charge of AI results, not just AI tools.",
        "Agree on two or three business goals AI should help with this year, like faster service or lower costs.",
        "Set aside a small budget just for your first few AI tests.",
      ],
    },
    developing: {
      headline: "Turn your AI goals into a plan with a budget",
      steps: [
        "Write a one-page AI plan: your goals, which teams go first, your safety rules and how you'll measure success.",
        "Form a small group from across the company that meets monthly to approve and review AI projects.",
        "Fund each AI project based on what it should return, not from scattered team budgets.",
      ],
    },
  },
  value: {
    strength: "You choose AI projects with care and measure what they deliver.",
    foundational: {
      headline: "You don't have a ranked list of AI projects you can measure",
      steps: [
        "Meet with each key team for an hour to list work that is repeated often.",
        "Score each idea on value, effort, fit and risk. Pick one or two to test.",
        "Before each test starts, write down today's time, cost and error rate, so you can show the change.",
      ],
    },
    developing: {
      headline: "Manage AI as one ranked list, not a set of one-off tests",
      steps: [
        "Keep one ranked list of AI projects, with an owner, a stage and an expected value for each.",
        "Score the list again every three months, and stop tests that aren't working.",
        "Each month, track what every live project really saves or earns (hours, costs, sales).",
      ],
    },
  },
  data: {
    strength: "Your data and documents are easy to reach, have owners and are ready for AI.",
    foundational: {
      headline: "The data AI needs is hard to find, get to or trust",
      steps: [
        "For your top AI projects, list the systems and documents each one needs, and who owns them.",
        "Start with projects that use data you already manage well, like documents, help tickets or emails.",
        "Give owners to the few data sets that matter most. Fix the worst problems first.",
      ],
    },
    developing: {
      headline: "Get your key data and documents ready for AI",
      steps: [
        "Let tools reach your most important data through secure connections, not manual exports.",
        "Clean up the documents AI assistants will search (policies, how-to guides, contracts), and set who can see what.",
        "For each AI project, track what data it needs and whether you have access, so problems show up early.",
      ],
    },
  },
  technology: {
    strength: "People have safe, useful AI tools, and AI can connect to your main systems.",
    foundational: {
      headline: "Employees don't have safe, approved AI tools",
      steps: [
        "Pick a company AI assistant with secure sign-in and data protection. Stop the use of personal accounts.",
        "Start with tools you already pay for, like your email and office apps or your sales system, where they fit.",
        "Write down which systems AI may connect to, and which data must never leave them.",
      ],
    },
    developing: {
      headline: "Move from single tools to one AI setup you can reuse",
      steps: [
        "Use one standard way to connect AI to your main systems, so each project doesn't start from zero.",
        "Test and watch AI that's in use: its quality, its cost and how often it fails.",
        "Avoid getting locked into one company's AI, so you can switch as prices and quality change.",
      ],
    },
  },
  people: {
    strength: "Your people understand AI, have the skills and are open to new ways of working.",
    foundational: {
      headline: "Few people understand AI or can build with it",
      steps: [
        "Run hands-on AI basics classes for leaders and front-line teams, using your own work as examples.",
        "Find a few AI fans in each team and give them time to try things.",
        "Talk openly about how jobs will change. It eases worry and brings out good ideas.",
      ],
    },
    developing: {
      headline: "Build skills, and a group of AI helpers in every team",
      steps: [
        "Offer training for each role: writing prompts for everyone, building for power users, and checking AI work for managers.",
        "Pair a small team of your own with an outside partner, so you learn while you build.",
        "Share wins with everyone, so more people start using AI.",
      ],
    },
  },
  governance: {
    strength: "Clear rules and safety checks let you use more AI, safely.",
    foundational: {
      headline: "There are no rules yet for using AI safely and legally",
      steps: [
        "Share a short set of AI rules: which tools are approved, what data can be used, and who to ask.",
        "Keep a list of every AI tool and project in use, including unofficial ones.",
        "Require a quick privacy and security check before any AI that customers see goes live.",
      ],
    },
    developing: {
      headline: "Check every AI project for risk, the same way each time",
      steps: [
        "Sort every AI project by how risky it is. Check projects that make decisions about people more closely.",
        "For each risk level, set how a person checks the AI's work: spot checks, full review, or a person decides.",
        "Re-check live AI on a schedule, as AI tools and laws change.",
      ],
    },
  },
};

export type DimensionInsight = {
  dimension: DimensionId;
  label: string;
  score: number;
  band: Band;
  headline: string;
  nextSteps: string[];
};

export type Recommendations = {
  /** Dimensions scoring 70+, strongest first. */
  strengths: DimensionInsight[];
  /** Dimensions below 70, weakest first. */
  gaps: DimensionInsight[];
  /** The (up to) three weakest dimensions to work on first. */
  priorities: DimensionInsight[];
};

export function insightFor(dimension: DimensionId, score: number): DimensionInsight {
  const band = bandFor(score);
  const p = PLAYBOOK[dimension];
  const label = DIMENSIONS.find((d) => d.id === dimension)!.label;
  if (band === "strength") return { dimension, label, score, band, headline: p.strength, nextSteps: [] };
  return { dimension, label, score, band, headline: p[band].headline, nextSteps: p[band].steps };
}

export function recommendationsFor(scores: Partial<Record<string, number>>): Recommendations {
  const ranked = rankDimensions(scores).map(({ id, score }) => insightFor(id, score));
  const gaps = ranked.filter((i) => i.band !== "strength");
  const strengths = ranked.filter((i) => i.band === "strength").reverse();
  return { strengths, gaps, priorities: gaps.slice(0, 3) };
}
