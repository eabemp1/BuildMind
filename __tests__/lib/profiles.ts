/**
 * The test founders. Each is a realistic person at a realistic point, written the way real founders write
 * (including the vague and the copied-from-ChatGPT). The harness in founders.test.ts runs every one through the
 * planner, the first-run bank, the guard rules and the channel composer. Add a profile whenever a real account
 * shows a new kind of problem; the first two come from real accounts (names changed to the product only).
 */
export interface TestFounder {
  id: string;
  note: string;
  product: string;
  stage: string;
  userType: string;
  problem: string;
  /** What they have told BuildMind in reflections, e.g. "I have no users yet". */
  said: string[];
  /** Tasks shown so far, newest first. */
  recent: Array<{ text: string; outcome: string | null }>;
  /** What the first task must not be about, checked against the planner's choice. */
  neverFirst?: string[];
}

export const FOUNDERS: TestFounder[] = [
  { id: "mvp-built-no-users", note: "Real account: said 'I've built it', MVP, no users. Was told to build a results page.", product: "Nevrix", stage: "MVP", userType: "founders", problem: "Startup idea evaluation across financial, environmental and regulatory factors", said: ["I have no users yet"], recent: [], neverFirst: ["build"] },
  { id: "idea-vague-empty-users", note: "Real account: Idea stage, no target users, copy-pasted definition as the problem.", product: "DistriGINE", stage: "Idea", userType: "", problem: "A scalable repeatable growth framework to acquire users", said: [], recent: [], neverFirst: ["build"] },
  { id: "idea-clear-ghana", note: "Clear idea and audience, Accra.", product: "ChopBox", stage: "Idea", userType: "small restaurant owners in Accra", problem: "They lose orders because they track them in WhatsApp chats", said: [], recent: [], neverFirst: ["build"] },
  { id: "validation-some-talks", note: "Validation stage, finished one task.", product: "FarmLedger", stage: "Validation", userType: "smallholder farmers", problem: "No simple record of what was sold and at what price", said: [], recent: [{ text: "Ask 3 farmers how they track sales", outcome: "completed" }] },
  { id: "launch-no-users", note: "Launch stage, nothing live users yet.", product: "PayBridge", stage: "Launch", userType: "freelancers", problem: "Getting paid across currencies is slow", said: ["I have no users yet"], recent: [] },
  { id: "growth-says-no-users", note: "Chose Growth stage but has said they have no users.", product: "TaskNest", stage: "Growth", userType: "student teams", problem: "Group projects fall apart without clear owners", said: ["I have no users"], recent: [], neverFirst: ["scale", "growth"] },
  { id: "revenue-says-no-users", note: "Chose Revenue stage but has no users.", product: "BillEase", stage: "Revenue", userType: "market traders", problem: "Tracking who owes money", said: ["nobody uses it yet"], recent: [], neverFirst: ["scale", "growth"] },
  { id: "name-only", note: "Gave only a name, everything else empty.", product: "Zeno", stage: "Idea", userType: "", problem: "", said: [], recent: [] },
  { id: "blocked-twice", note: "Two tasks blocked, no one to contact.", product: "LinkUp", stage: "Validation", userType: "recruiters", problem: "Slow hiring for small firms", said: ["I don't know anyone to ask"], recent: [{ text: "Email 3 recruiters", outcome: "blocked" }, { text: "DM 3 recruiters on LinkedIn", outcome: "blocked" }] },
  { id: "technical-platform-trouble", note: "Their blocker is a platform problem; the task must not turn into debugging it.", product: "ClipSort", stage: "Validation", userType: "video editors", problem: "Finding clips in long footage", said: ["My Discord server verification is failing"], recent: [] },
];
