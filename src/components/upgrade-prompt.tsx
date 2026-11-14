import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FEATURE_LABELS, planForFeature, type Feature } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Upsell shown in place of a feature the workspace's plan doesn't include. People who can manage
 * billing get a link to Plan & billing; everyone else is told to ask an admin.
 */
export function UpgradePrompt({
  feature,
  slug,
  canManageBilling,
  title,
  description,
  compact = false,
  className,
  children,
}: {
  feature: Feature;
  slug: string;
  canManageBilling: boolean;
  title?: ReactNode;
  description?: ReactNode;
  /** One-line variant for tight spots (buttons, table footers). */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const plan = planForFeature(feature);
  const info = FEATURE_LABELS[feature];
  const href = `/w/${slug}/billing?upgrade=${feature}`;

  if (compact) {
    return (
      <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600", className)}>
        <Lock className="size-3.5 shrink-0 text-violet-600" aria-hidden />
        <span>
          {title ?? info.name} is on the <span className="font-medium text-slate-900">{plan.name}</span> plan.
        </span>
        {canManageBilling ? (
          <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-violet-700 hover:underline">
            Upgrade <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <span className="text-slate-500">Ask a workspace admin to upgrade.</span>
        )}
      </p>
    );
  }

  return (
    <div className={cn("rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3.5", className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-violet-700 ring-1 ring-violet-200" aria-hidden>
          <Lock className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {title ?? info.name}{" "}
            <span className="ml-1 inline-flex translate-y-[-1px] items-center rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
              {plan.name}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600">{description ?? info.description}</p>
          {children}
          <div className="mt-2.5">
            {canManageBilling ? (
              <Link
                href={href}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-900 px-3 text-sm font-medium text-white hover:bg-ink-800"
              >
                Upgrade to {plan.name} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : (
              <p className="text-sm font-medium text-slate-700">Ask a workspace owner or admin to upgrade to {plan.name}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
