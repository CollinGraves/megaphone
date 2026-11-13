import { Badge } from "@/components/ui";

const TONES = { pending: "neutral", requested: "blue", enriched: "radar", failed: "red" } as const;
const LABELS = { pending: "Pending", requested: "Requested", enriched: "Enriched", failed: "Failed" } as const;

export function EnrichmentBadge({ status }: { status: keyof typeof TONES }) {
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}
