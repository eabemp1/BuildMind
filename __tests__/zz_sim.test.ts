import { it } from "vitest";
import { planTodayMission, assessTaskQuality, kindOfTask, MISSION_KINDS, type MissionKind, type RecentTask } from "@/lib/todayMission";
import { fallbackForKind } from "@/lib/todayFallbacks";

const PEOPLE = new Set(["interview", "outreach", "follow_up"]);
type Persona = { name: string; stage: string; userType: string; problem: string; product: string; noUsers: boolean; trait: "does" | "avoids_people" | "swaps_a_lot" | "builds_instead" | "drained"; saysBuilt?: boolean };
const P: Persona[] = [
  { name: "barber-booking", stage: "Idea", userType: "independent barbers", problem: "missed bookings and no-shows", product: "CutBook", noUsers: true, trait: "does" },
  { name: "barber-avoider", stage: "Idea", userType: "independent barbers", problem: "missed bookings and no-shows", product: "CutBook", noUsers: true, trait: "avoids_people" },
  { name: "clinic-swapper", stage: "Validation", userType: "clinic managers", problem: "paper patient records", product: "ClinicFlow", noUsers: true, trait: "swaps_a_lot" },
  { name: "dev-builder", stage: "MVP", userType: "freelance designers", problem: "late client payments", product: "PayNudge", noUsers: true, trait: "builds_instead", saysBuilt: true },
  { name: "drained-founder", stage: "Validation", userType: "farm cooperatives", problem: "no price information", product: "MarketPrice", noUsers: false, trait: "drained" },
  { name: "growth-saas", stage: "Growth", userType: "ecommerce owners", problem: "abandoned carts", product: "CartBack", noUsers: false, trait: "does" },
  { name: "launch-stage", stage: "Launch", userType: "church admins", problem: "tracking donations", product: "TithePal", noUsers: false, trait: "avoids_people" },
  { name: "mvp-swapper", stage: "MVP", userType: "tutors", problem: "scheduling lessons", product: "LessonLoop", noUsers: false, trait: "swaps_a_lot" },
];
function outcomeFor(p: Persona, kind: MissionKind, day: number): string {
  if (p.trait === "avoids_people" && PEOPLE.has(kind)) return day % 3 === 0 ? "partial" : "skipped";
  if (p.trait === "swaps_a_lot") return day % 2 === 0 ? "replaced" : "completed";
  if (p.trait === "builds_instead" && kind !== "build") return "skipped";
  return "completed";
}
it("sim", () => {
  const out: string[] = [];
  for (const p of P) {
    const hist: RecentTask[] = [];
    const seq: string[] = [];
    let people = 0, done = 0;
    for (let d = 0; d < 14; d++) {
      const m = planTodayMission({ stage: p.stage, recentTasks: hist, avoidance: p.trait === "avoids_people" ? ["reaching out to strangers"] : [], blockers: [], activeGoals: [`talk to ${p.userType}`], noUsers: p.noUsers, saysBuilt: p.saysBuilt, cognitiveLoad: p.trait === "drained" ? "drained" : "fresh", momentum: 50 });
      const fb = fallbackForKind(m.kind, { userType: p.userType, problemDesc: p.problem, productName: p.product, stage: p.stage }, `${p.name}:${d}`);
      const oc = outcomeFor(p, m.kind, d);
      seq.push(`${m.kind}${oc === "completed" ? "" : "(" + oc[0] + ")"}`);
      if (PEOPLE.has(m.kind)) people++;
      if (oc === "completed") done++;
      hist.unshift({ text: fb.action, outcome: oc });
      if (d === 3 || d === 9) out.push(`  [${p.name} d${d}] kind=${m.kind} reasons=${m.reasons.join(" | ")}\n     task=${fb.action}\n     done_when=${fb.done_when} | time=${fb.time}`);
    }
    out.push(`${p.name} (${p.trait}): people=${people}/14 done=${done}\n   ${seq.join(" ")}`);
  }
  console.log("\n" + out.join("\n"));
});
