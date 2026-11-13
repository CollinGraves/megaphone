import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/permissions";
import { listAccessibleWorkspaces } from "@/lib/workspace";
import { Logo } from "./logo";
import { SignOutButton } from "./sign-out-button";

const navLink = "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";

export async function AppHeader({ user }: { user: CurrentUser }) {
  const workspaces = await listAccessibleWorkspaces(user);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo href="/feed" />
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          <Link href="/feed" className={navLink}>
            Feed
          </Link>
          <Link href="/radar" className={navLink}>
            Top stories
          </Link>
          {workspaces.length === 1 ? (
            <Link href={`/w/${workspaces[0].slug}`} className={navLink}>
              Workspace
            </Link>
          ) : workspaces.length > 1 ? (
            <details className="group relative">
              <summary className={`${navLink} flex cursor-pointer list-none items-center gap-1`}>
                Workspaces <ChevronDown className="size-3.5" />
              </summary>
              <div className="absolute left-0 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {workspaces.map((w) => (
                  <Link key={w.id} href={`/w/${w.slug}`} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    {w.name}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
          {isStaff(user.platformRole) ? (
            <Link href="/admin" className={navLink}>
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-slate-100">
              <span className="flex size-8 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">{initials}</span>
              <ChevronDown className="size-3.5 text-slate-500" />
            </summary>
            <div className="absolute right-0 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2">
                <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
                <div className="truncate text-xs text-slate-500">{user.email}</div>
              </div>
              <nav className="py-1 md:hidden">
                <Link href="/feed" className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                  Feed
                </Link>
                {workspaces.map((w) => (
                  <Link key={w.id} href={`/w/${w.slug}`} className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    {w.name}
                  </Link>
                ))}
                {isStaff(user.platformRole) ? (
                  <Link href="/admin" className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    Admin
                  </Link>
                ) : null}
              </nav>
              <Link href="/workspaces/new" className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Create a workspace
              </Link>
              <Link href="/settings" className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                Settings &amp; preferences
              </Link>
              <SignOutButton />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
