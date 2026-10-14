import { describe, it, expect } from "vitest";
import {
  tierForCountry, effectiveTier, tierPriceUsd, tierPriceCents, lowestTierCents,
  pickGhsPlanCode, publicPrice, normalizeCountryCode,
} from "@/lib/billing/regionalPricing";

describe("regional pricing", () => {
  it("maps African countries to the africa tier, others to standard", () => {
    for (const c of ["GH", "NG", "KE", "ZA", "EG", "gh", " ng "]) expect(tierForCountry(c)).toBe("africa");
    for (const c of ["US", "GB", "IN", "", undefined, null]) expect(tierForCountry(c)).toBe("standard");
  });
  it("accepts GHANA as GH", () => expect(normalizeCountryCode("Ghana")).toBe("GH"));

  it("Ghana falls back to standard until the Africa Paystack plan exists", () => {
    expect(effectiveTier("GH", {})).toBe("standard");
    expect(effectiveTier("GH", { PAYSTACK_AFRICA_PLAN_CODE: "PLN_x" })).toBe("africa");
    expect(effectiveTier("NG", {})).toBe("africa"); // Polar sets price per checkout
  });

  it("prices tiers and founding discount", () => {
    expect(tierPriceUsd("standard", false)).toBe(39);
    expect(tierPriceUsd("africa", false)).toBe(15);
    expect(tierPriceUsd("africa", true)).toBe(7.5);
    expect(tierPriceCents("africa", true)).toBe(750);
    expect(tierPriceUsd("standard", false, "free")).toBe(0);
    expect(lowestTierCents()).toBe(1500);
  });

  it("picks Paystack plan codes with safe fallbacks", () => {
    const e = { PAYSTACK_BUILDER_PLAN_CODE: "STD", PAYSTACK_AFRICA_PLAN_CODE: "AF" };
    expect(pickGhsPlanCode("standard", false, e).planCode).toBe("STD");
    expect(pickGhsPlanCode("africa", false, e).planCode).toBe("AF");
    const f = pickGhsPlanCode("africa", true, e);
    expect(f.planCode).toBe("AF");
    expect(f.warning).toBeTruthy();
    expect(pickGhsPlanCode("africa", true, { ...e, PAYSTACK_AFRICA_FOUNDING_PLAN_CODE: "AFF" }).planCode).toBe("AFF");
  });

  it("public price never quotes a price it can't charge", () => {
    expect(publicPrice("GH", {}).label).toBe("$39/mo");
    expect(publicPrice("GH", { PAYSTACK_AFRICA_PLAN_CODE: "AF" })).toMatchObject({ label: "$15/mo", regional: true });
    expect(publicPrice("US", {}).regional).toBe(false);
  });
});
