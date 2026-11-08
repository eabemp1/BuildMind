import { describe, it, expect } from "vitest";
import { guardRules } from "@/lib/today/rules";

describe("too_long rule", () => {
  it.each([
    "Spend the next two hours manually copy-pasting the price of 1kg rice from three grocery sites.",
    "Block out half a day to build the first version.",
    "Work for 3 hours on the landing page.",
    "Spend 180 minutes interviewing people.",
  ])("flags %s", (t) => expect(guardRules(t)).toContain("too_long"));
  it.each([
    "Ask one person how they compare prices today. It takes 15 minutes.",
    "Spend 90 minutes drafting the first interview script.",
    "Send 3 messages in the next 30 minutes.",
  ])("allows %s", (t) => expect(guardRules(t)).not.toContain("too_long"));
});
