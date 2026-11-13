import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
