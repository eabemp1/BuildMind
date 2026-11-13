import { describe, it, expect } from "vitest";
import { placeVerdict, foreignSigns } from "@/lib/leads/place";
import { keepRightPlace } from "@/lib/leads/engine";
import type { Lead } from "@/lib/leads/validate";

const uk = { country: "United Kingdom", city: "Bristol" };
describe("placeVerdict", () => {
  it("rejects Bristol, Tennessee when the founder asked for Bristol, UK", () => {
    expect(placeVerdict("Boyd Bicycle Shop, 123 Main St, Bristol, TN 37620. Call (423) 555-0199.", uk)).toBe("wrong");
    expect(placeVerdict("Bike repair in Bristol, Tennessee, serving the Tri-Cities.", uk)).toBe("wrong");
  });
  it("accepts a Bristol, UK page", () => {
    expect(placeVerdict("Bristol Bike Repairs, 14 Gloucester Road, Bristol BS7 8AE, United Kingdom", uk)).toBe("confirmed");
  });
  it("a UK postcode is wrong for a Ghana search but fine for a UK one", () => {
    expect(foreignSigns("Shop at BS7 8AE", "Ghana")).toBe("united kingdom");
    expect(foreignSigns("Shop at BS7 8AE", "United Kingdom")).toBeNull();
  });
  it("accepts UK, England and city aliases for a UK search", () => {
    expect(placeVerdict("Repairs across England", uk)).toBe("confirmed");
    expect(placeVerdict("Our shop in Bristol sells and repairs bikes", uk)).toBe("confirmed");
  });
  it("says unknown, not wrong, when the page shows no place at all", () => {
    expect(placeVerdict("Family run bike shop. Open Monday to Saturday.", uk)).toBe("unknown");
  });
  it("a US-looking page that also names the UK is kept", () => {
    expect(placeVerdict("Ships from our UK workshop in Bristol, United Kingdom. US customers welcome, TN 37620 resellers.", uk)).toBe("confirmed");
  });
});

describe("keepRightPlace", () => {
  const base: Lead = { name: "x", kind: "business", where: "", url: "https://a.example/b", why_fit: "", evidence: "A bike shop with repairs offered.", how_to_reach: "", first_message: "" };
  it("drops the wrong-country lead and marks an unconfirmed one", () => {
    const leads = [
      { ...base, name: "Boyd Bicycle Shop", url: "https://explorebristol.com/boyd-bicycle-shop/" },
      { ...base, name: "Quiet Shop", url: "https://quiet.example/shop" },
    ];
    const pages = [
      { url: "https://explorebristol.com/boyd-bicycle-shop/", title: "Boyd", text: "Boyd Bicycle Shop, Bristol, TN 37620. (423) 555-0199" },
      { url: "https://quiet.example/shop", title: "Quiet", text: "Open Monday to Saturday." },
    ];
    const out = keepRightPlace(leads, uk, pages, [], []);
    expect(out.map((l) => l.name)).toEqual(["Quiet Shop"]);
    expect(out[0].location).toBe("unconfirmed");
  });
});
