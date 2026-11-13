import Link from "next/link";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export function RadarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <circle cx="16" cy="16" r="15" className="fill-ink-900" />
      <circle cx="16" cy="16" r="10.5" fill="none" strokeWidth="1.2" className="stroke-radar-500/40" />
      <circle cx="16" cy="16" r="6" fill="none" strokeWidth="1.2" className="stroke-radar-500/60" />
      <path d="M16 16 L16 1.5 A14.5 14.5 0 0 1 28.6 9 Z" className="fill-radar-500/35" />
      <line x1="16" y1="16" x2="28.6" y2="9" strokeWidth="1.6" strokeLinecap="round" className="stroke-radar-400" />
      <circle cx="21.5" cy="11.5" r="1.7" className="fill-radar-300" />
      <circle cx="16" cy="16" r="1.4" className="fill-radar-400" />
    </svg>
  );
}

export function Logo({ href = "/", dark = false, className }: { href?: string; dark?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2", className)}>
      <RadarMark />
      <span className={cn("text-[15px] font-semibold tracking-tight", dark ? "text-white" : "text-slate-900")}>
        {BRAND}
        <span className={cn("ml-1.5 font-normal", dark ? "text-slate-400" : "text-slate-500")}>by North Labs</span>
      </span>
    </Link>
  );
}
