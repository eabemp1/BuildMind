import { it } from "vitest";
import { MISSION_KINDS } from "@/lib/todayMission";
import { fallbackForKind } from "@/lib/todayFallbacks";
it("bank", () => {
  const o: string[] = [];
  for (const k of MISSION_KINDS) { const s = new Set<string>(); for (let i = 0; i < 200; i++) s.add(fallbackForKind(k, { userType: "u", problemDesc: "p", productName: "N", stage: "Validation" }, `x${i}`).action); o.push(`${k}:${s.size}`); }
  console.log("\nvariants " + o.join(" "));
});
