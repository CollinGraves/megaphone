import type { Metadata } from "next";
import { Questionnaire } from "../_components/questionnaire";

export const metadata: Metadata = {
  title: "AI readiness assessment",
  robots: { index: false, follow: true },
};

export default async function AssessmentStartPage({ searchParams }: PageProps<"/assessment/start">) {
  const sp = await searchParams;
  const src = typeof sp.src === "string" ? sp.src.replace(/[^\w:.\-]/g, "").slice(0, 80) : undefined;
  return <Questionnaire source={src || "assessment_page"} />;
}
