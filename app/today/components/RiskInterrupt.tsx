"use client";

import { WhyReveal } from "@/components/ui/WhyReveal";
import type { Signal } from "./IntelligencePanel";

export function EvidenceDisclosure({ signal, expectedEvidence, uncertainty }: { signal?: Signal; expectedEvidence?: string; uncertainty?: string }) {
  const items = [
    ...(signal?.evidence?.map((item) => ({ label: item.source, value: item.detail })) ?? []),
    ...(expectedEvidence ? [{ label: "Expected evidence", value: expectedEvidence }] : []),
    ...(uncertainty ? [{ label: "Uncertainty", value: uncertainty }] : []),
  ];
  if (!items.length) return null;
  return <WhyReveal triggerLabel="Evidence and uncertainty" items={items} />;
}
