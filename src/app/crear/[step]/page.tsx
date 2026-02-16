import { notFound } from "next/navigation";
import { Wizard } from "@/components/wizard";

export default async function StepPage({ params }: { params: Promise<{ step: string }> }) {
  const resolved = await params;
  const step = Number(resolved.step);
  if (!Number.isFinite(step) || step < 1 || step > 10) {
    notFound();
  }
  return <Wizard step={step} />;
}
