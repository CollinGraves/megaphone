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
  foundational: "Foundational gap",
  developing: "Developing",
  strength: "Strength",
};

type Playbook = {
  strength: string;
  foundational: { headline: string; steps: string[] };
  developing: { headline: string; steps: string[] };
};

const PLAYBOOK: Record<DimensionId, Playbook> = {
  strategy: {
    strength: "Leadership owns AI, with a strategy and funding tied to business goals.",
    foundational: {
      headline: "AI has no clear owner or business mandate yet",
      steps: [
        "Name one executive sponsor accountable for AI outcomes, not just AI tooling.",
        "Agree on two or three business goals AI should support this year (e.g. faster service, lower cost to serve).",
        "Set aside a small, ring-fenced budget for a first round of pilots.",
      ],
    },
    developing: {
      headline: "Turn AI ambition into a funded plan",
      steps: [
        "Write a one-page AI strategy: goals, priority functions, guardrails and how success is measured.",
        "Form a small cross-functional steering group that meets monthly to approve and review initiatives.",
        "Fund initiatives individually against expected value instead of from scattered team budgets.",
      ],
    },
  },
  value: {
    strength: "You pick AI use cases deliberately and measure what they deliver.",
    foundational: {
      headline: "No pipeline of prioritized, measurable use cases",
      steps: [
        "Run a short ideation session with each priority function to list repetitive, high-volume work.",
        "Score each idea on value, feasibility, alignment and risk, and pick one or two to pilot.",
        "Record a baseline (time, cost, error rate) before each pilot starts so impact can be shown.",
      ],
    },
    developing: {
      headline: "Manage AI as a portfolio, not a set of experiments",
      steps: [
        "Keep a single prioritized list of AI initiatives with an owner, stage and expected value for each.",
        "Re-score the list quarterly and stop pilots that aren't showing results.",
        "Track actual impact (hours saved, cost, revenue) monthly for everything in production.",
      ],
    },
  },
  data: {
    strength: "Your data and knowledge are accessible, owned and ready for AI.",
    foundational: {
      headline: "The data AI needs is hard to find, reach or trust",
      steps: [
        "For your top use cases, list the systems and documents each one depends on and who owns them.",
        "Start with use cases that run on data you already control well (documents, tickets, emails).",
        "Assign owners to the handful of datasets that matter most and fix the worst quality issues first.",
      ],
    },
    developing: {
      headline: "Make key data and knowledge AI-ready",
      steps: [
        "Expose priority datasets through governed APIs or a warehouse instead of manual exports.",
        "Clean up and permission the knowledge base (policies, procedures, contracts) AI assistants will search.",
        "Track data access as a dependency for each initiative so blockers surface early.",
      ],
    },
  },
  technology: {
    strength: "People have safe, capable AI tools, and AI can connect to your core systems.",
    foundational: {
      headline: "Employees lack safe, approved AI tools",
      steps: [
        "Choose an enterprise AI assistant with single sign-on and data protections, and retire personal-account use.",
        "Start with the platforms you already license (e.g. your productivity suite or CRM) where they fit.",
        "Document which systems AI may connect to and which data must never leave them.",
      ],
    },
    developing: {
      headline: "Move from tools to a reusable AI platform",
      steps: [
        "Standardize how AI connects to core systems (APIs, connectors) so each project doesn't start from scratch.",
        "Add evaluation and monitoring for AI in production: quality, cost and failure rates.",
        "Keep platform choices vendor-neutral so you can switch models as prices and capabilities change.",
      ],
    },
  },
  people: {
    strength: "Your people are AI-literate, skilled and willing to change how they work.",
    foundational: {
      headline: "Low AI literacy and few people who can build",
      steps: [
        "Run hands-on AI basics sessions for leaders and frontline teams, using your own workflows as examples.",
        "Identify a few enthusiastic champions in each function and give them time to experiment.",
        "Talk openly about how roles will change, to reduce anxiety and surface good ideas.",
      ],
    },
    developing: {
      headline: "Build skills and a champions network",
      steps: [
        "Offer role-based training (prompting for everyone, building for power users, oversight for managers).",
        "Pair a small internal team with a delivery partner to build capability while shipping.",
        "Recognize and share wins publicly so adoption spreads beyond early enthusiasts.",
      ],
    },
  },
  governance: {
    strength: "Clear policies and risk review let you scale AI responsibly.",
    foundational: {
      headline: "No guardrails for safe, compliant AI use",
      steps: [
        "Publish a short AI acceptable-use policy: approved tools, what data can be used, and who to ask.",
        "Keep an inventory of AI tools and use cases already in use, including unofficial ones.",
        "Require a lightweight privacy and security check before any customer-facing AI goes live.",
      ],
    },
    developing: {
      headline: "Make risk review consistent and proportionate",
      steps: [
        "Classify every use case into risk tiers, with stricter review for decisions that affect people.",
        "Define human-oversight rules for each tier (spot checks, full review, or a person decides).",
        "Schedule periodic re-review of AI systems in production as models and regulations change.",
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
