import { RadarMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <RadarMark className="size-12" />
      <h1 className="mt-6 text-2xl font-semibold text-slate-900">Nothing on the radar here</h1>
      <p className="mt-2 max-w-md text-slate-600">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <div className="mt-6 flex gap-3">
        <ButtonLink href="/radar">Top stories</ButtonLink>
        <ButtonLink href="/feed" variant="secondary">
          My feed
        </ButtonLink>
      </div>
    </div>
  );
}
