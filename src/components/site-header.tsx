import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { Logo } from "./logo";
import { ButtonLink } from "./ui";
import { BRAND } from "@/lib/brand";

export async function SiteHeader({ dark = false }: { dark?: boolean }) {
  const user = await getCurrentUser();
  const link = dark ? "text-sm text-slate-300 hover:text-white" : "text-sm text-slate-600 hover:text-slate-900";
  return (
    <header className={dark ? "bg-ink-950" : "border-b border-slate-200 bg-white"}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo dark={dark} />
        <nav className="ml-4 hidden items-center gap-6 md:flex">
          <Link href="/radar" className={link}>
            Top stories
          </Link>
          <Link href="/assessment?src=nav" className={`${link} hidden whitespace-nowrap lg:inline`}>
            <span className="xl:hidden">AI readiness</span>
            <span className="hidden xl:inline">AI readiness assessment</span>
          </Link>
          <Link href="/#workspace" className={link}>
            For companies
          </Link>
          <Link href="/contact" className={link}>
            Talk to North Labs
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <ButtonLink href="/feed" variant={dark ? "accent" : "primary"} size="sm">
              Open my feed
            </ButtonLink>
          ) : (
            <>
              <Link href="/sign-in" className={`${link} px-2`}>
                Sign in
              </Link>
              <ButtonLink href="/sign-up?src=header" variant={dark ? "accent" : "primary"} size="sm">
                Get your free radar
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <span className="font-medium text-slate-700">{BRAND}</span> is built and run by North Labs.
        </div>
        <nav className="flex flex-wrap gap-5">
          <Link href="/radar" className="hover:text-slate-900">
            Top stories
          </Link>
          <Link href="/assessment?src=footer" className="hover:text-slate-900">
            AI readiness assessment
          </Link>
          <Link href="/contact" className="hover:text-slate-900">
            Contact
          </Link>
          <Link href="/sign-up?src=footer" className="hover:text-slate-900">
            Sign up
          </Link>
        </nav>
      </div>
    </footer>
  );
}
