import { it } from "vitest";
import { kindOfTask, MISSION_KINDS } from "@/lib/todayMission";
import { fallbackForKind } from "@/lib/todayFallbacks";
it("cls", () => {
  const out: string[] = []; let bad = 0, total = 0;
  for (const kind of MISSION_KINDS) {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const fb = fallbackForKind(kind, { userType: "independent barbers", problemDesc: "missed bookings and no-shows", productName: "CutBook", stage: "Validation" }, `s${i}`);
      if (seen.has(fb.action)) continue; seen.add(fb.action); total++;
      const k = kindOfTask(fb.action);
      if (k !== kind) { bad++; out.push(`${kind} -> ${k}: ${fb.action.slice(0, 120)}`); }
    }
  }
  console.log(`\nmisclassified ${bad}/${total}\n` + out.join("\n"));
});
