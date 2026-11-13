import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} />
      <div className="flex-1">{children}</div>
    </>
  );
}
