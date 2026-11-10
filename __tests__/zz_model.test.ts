import { it } from "vitest";
import { planTodayMission, assessTaskQuality, missionMeta, type Mission } from "@/lib/todayMission";
const ctx = { title: "CutBook", targetUsers: "independent barbers in Accra", problem: "missed bookings and no-shows", recentTasks: [], blockers: [], avoidance: ["messaging strangers"], activeGoals: ["talk to 5 barbers"] };
const M = (kind: any) => planTodayMission({ stage: "Idea", recentTasks: [], avoidance: [], blockers: [], activeGoals: [], noUsers: true, excludeAction: undefined, ...{} }) && ({ kind } as any);
const cases: Array<[string, string, any]> = [
 ["interview", "Walk into two barbershops in East Legon this afternoon, ask the owner how they handled the last no-show, and write what they said word for word.", { done_when: "Two owners' answers about their last no-show are written down.", first_step: "Pick the two shops nearest you and go at 3pm.", minutes: 60, platform: "In person" }],
 ["outreach", "Send this WhatsApp to 5 barbers you already know: 'Quick question, how do you stop people missing their slot?'", { done_when: "Five messages are sent.", first_step: "Open WhatsApp and find 5 barber contacts.", minutes: 20, platform: "WhatsApp", draft: "Hi, quick question: how do you stop clients missing their slot? Takes 1 minute to answer." }],
 ["follow_up", "Reply to Kwame, who said last week he loses about 3 bookings a week, and ask if you can watch him handle bookings on Saturday.", { done_when: "Kwame has answered yes or no.", first_step: "Open the chat with Kwame.", minutes: 10, platform: "WhatsApp", draft: "Kwame, thanks for last week. Can I sit in for an hour on Saturday and watch how bookings come in?" }],
 ["pricing", "Tell 2 barbers you will charge GHS 40 a month for booking reminders and ask if they would pay it this week.", { done_when: "Two barbers gave a yes, no or counter-price.", first_step: "Pick the two barbers who complained most.", minutes: 20, platform: "WhatsApp" }],
 ["build", "Build the page where a client picks a time slot and gets a WhatsApp reminder the evening before.", { done_when: "A test booking triggers a reminder to your own number.", first_step: "Create the booking form with name, phone and time.", minutes: 90 }],
 ["publish", "Post one thing in a barbers' Facebook group in Accra: the number of bookings you heard barbers lose each week, and ask for their story.", { done_when: "The post is live and you have replied to every comment.", first_step: "Write the 3-line post.", minutes: 30, platform: "Facebook" }],
 ["analyze", "Read your 4 interview notes and write which no-show workaround came up most, and what you will test next.", { done_when: "A 3-line decision is written.", first_step: "Open your notes and highlight repeated words.", minutes: 30 }],
 ["unblock", "Message one barber you have been avoiding contacting, with one sentence and one question, and press send before you edit it twice.", { done_when: "The message is sent.", first_step: "Open the chat and type the first line.", minutes: 10, platform: "WhatsApp" }],
 ["reset", "Reply to the one unanswered WhatsApp message sitting in your inbox and clear it.", { done_when: "The reply is sent.", first_step: "Open the oldest unanswered chat.", minutes: 10, platform: "WhatsApp" }],
 ["outreach", "Post a contract sales/lead generation specialist job on two freelance platforms and receive at least 5 qualified applications - on WhatsApp", { done_when: "Five applications received.", first_step: "Log into Upwork.", minutes: 20, platform: "WhatsApp" }],
 ["interview", "Do customer discovery with potential users to understand their pain points.", { done_when: "You understand their pain points.", first_step: "Think of questions.", minutes: 30, platform: "Zoom" }],
];
it("model", () => {
  const out: string[] = [];
  for (const [kind, task, extra] of cases) {
    const mission = planTodayMission({ stage: "Idea", recentTasks: [], avoidance: [], blockers: [], activeGoals: [], noUsers: true });
    const m: Mission = { ...mission, kind, requires: missionMeta(kind).requires } as Mission;
    const r = assessTaskQuality({ task, ...extra }, m, ctx as any);
    out.push(`${r.pass ? "PASS" : "FAIL"} ${r.score} [${kind}] hard=${r.hardFails.join(",")} soft=${r.softFails.join(",")}\n    ${task.slice(0, 90)}`);
  }
  console.log("\n" + out.join("\n"));
});
