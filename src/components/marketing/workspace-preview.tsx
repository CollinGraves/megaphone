import { Bell, Gauge } from "lucide-react";

/** Illustrative workspace dashboard (example data) used on marketing pages. */
export function WorkspacePreview() {
  const rows = [
    { name: "Invoice exception triage", stage: "Production", platform: "Claude", value: "$412K / yr", w: "92%" },
    { name: "Sales call summaries", stage: "Pilot", platform: "Copilot", value: "$186K / yr", w: "71%" },
    { name: "Supplier risk monitoring", stage: "Building", platform: "OpenAI", value: "$240K / yr", w: "64%" },
    { name: "Maintenance assistant", stage: "Evaluating", platform: "Gemini", value: "$95K / yr", w: "48%" },
  ];
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60" aria-hidden>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Gauge className="size-4 text-radar-600" /> Example company
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["Projects", "14"],
          ["Value / yr", "$1.2M"],
          ["Hours / yr", "18,400"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-3">
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
            <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{r.name}</div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-radar-500" style={{ width: r.w }} />
              </div>
            </div>
            <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 sm:inline">{r.stage}</span>
            <span className="hidden rounded-md bg-radar-50 px-1.5 py-0.5 text-[11px] text-radar-800 sm:inline">{r.platform}</span>
            <span className="w-20 shrink-0 text-right text-xs font-medium text-slate-700 tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <Bell className="mt-0.5 size-3.5 shrink-0" />
        A vendor you use changed its pricing. 2 projects affected.
      </div>
    </div>
  );
}
