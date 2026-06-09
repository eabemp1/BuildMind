/**
 * lib/linguisticSignals.ts — Layer 2: Linguistic Signal Analysis
 *
 * Extracts behavioral signals from the founder's own language in reflection notes.
 * What the founder's words reveal that they didn't intend to say.
 *
 * Signals detected:
 *   1. Passive voice — avoidance of ownership ("the call didn't happen" vs "I didn't make the call")
 *   2. Vocabulary repetition — same words across weeks = fixation or unresolved anxiety
 *   3. Note length trend — getting shorter = disengagement signal
 *   4. Sentiment trajectory — direction over 14 days, not just today
 *   5. Specificity scoring — vague vs concrete notes correlate with execution quality
 *   6. Blocker clustering — what the founder says blocked them, grouped
 *   7. Confidence calibration — stated 4/5 confidence but 30% completion = self-awareness gap
 *
 * All analysis is deterministic / regex-based — no AI call needed.
 * The output is injected into the AI prompt so the model can name the pattern.
 */

export interface ReflectionEntry {
  content: string;            // The raw reflection note text
  created_at: string;         // ISO timestamp
  confidence?: number | null; // 1–5 founder self-rating, if collected
  completed: boolean;         // Whether the task for that day was completed
  blockers?: string | null;   // Explicit blocker field if schema has one
}

export interface LinguisticProfile {
  passiveVoiceRate: number;           // 0–1, fraction of sentences using passive constructions
  repeatedVocab: string[];            // words that recur across multiple reflections
  noteLengthTrend: "growing" | "shrinking" | "stable";
  avgNoteLength: number;              // avg word count
  sentimentTrajectory: "improving" | "declining" | "stable";
  specificityScore: number;           // 0–1, higher = more specific/concrete language
  blockerClusters: BlockerCluster[];  // grouped recurring blockers
  confidenceCalibrationGap: number | null; // stated avg confidence minus actual completion rate (0–1 scale)
  signals: LinguisticSignal[];        // named patterns ready to inject into prompt
}

export interface BlockerCluster {
  theme: string;       // e.g. "waiting for feedback"
  count: number;       // how many times mentioned
  lastSeen: string;    // ISO date
}

export interface LinguisticSignal {
  type:
    | "passive_voice"
    | "vocab_repetition"
    | "note_shrinking"
    | "sentiment_decline"
    | "low_specificity"
    | "blocker_recurrence"
    | "confidence_gap";
  message: string;   // surfaceable verbatim in AI response
  severity: "low" | "medium" | "high";
}

// ── Passive voice detection ──────────────────────────────────────────────────
// Heuristic: "to be" verb + past participle, or impersonal constructions
const PASSIVE_PATTERNS = [
  /\b(was|were|is|are|been|be)\s+\w+ed\b/gi,
  /\b(didn't|did not|couldn't|could not)\s+happen\b/gi,
  /\bthe\s+\w+\s+(didn't|did not|wasn't|was not)\b/gi,
  /\bit\s+(turned out|ended up|fell through)/gi,
  /\bthat\s+didn't\s+(work|go|happen)/gi,
];

const ACTIVE_OWNERSHIP_PATTERNS = [
  /\bI\s+(didn't|did not|couldn't|failed to|forgot to|avoided|skipped)/gi,
  /\bI\s+(chose|decided|prioritized|focused on)/gi,
];

function detectPassiveVoice(text: string): number {
  if (!text || text.length < 10) return 0;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  if (sentences.length === 0) return 0;

  let passiveCount = 0;
  for (const sentence of sentences) {
    const hasPassive = PASSIVE_PATTERNS.some((p) => p.test(sentence));
    const hasActive = ACTIVE_OWNERSHIP_PATTERNS.some((p) => p.test(sentence));
    if (hasPassive && !hasActive) passiveCount++;
  }
  return passiveCount / sentences.length;
}

// ── Vocabulary repetition ────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","is","was",
  "are","were","be","been","have","had","has","do","did","it","that","this","i","my",
  "me","we","our","you","your","he","she","they","their","them","its","not","no",
  "so","as","by","from","up","about","into","than","then","there","when","which",
  "what","how","just","also","will","would","could","should","can","may","might",
  "today","week","day","time","work","task","thing","done","got","get","went","go",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function findRepeatedVocab(entries: ReflectionEntry[]): string[] {
  const wordSeen: Record<string, Set<string>> = {}; // word → set of date keys
  for (const e of entries) {
    const dateKey = e.created_at.slice(0, 10);
    const words = tokenize(e.content);
    for (const w of words) {
      if (!wordSeen[w]) wordSeen[w] = new Set();
      wordSeen[w].add(dateKey);
    }
  }
  // Word repeated across 3+ distinct days = fixation signal
  return Object.entries(wordSeen)
    .filter(([, days]) => days.size >= 3)
    .sort(([, a], [, b]) => b.size - a.size)
    .slice(0, 5)
    .map(([word]) => word);
}

// ── Note length trend ────────────────────────────────────────────────────────
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function computeNoteLengthTrend(
  entries: ReflectionEntry[],
): { trend: LinguisticProfile["noteLengthTrend"]; avg: number } {
  if (entries.length < 4) return { trend: "stable", avg: 0 };

  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const counts = sorted.map((e) => wordCount(e.content));
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

  // Compare first half vs second half
  const half = Math.floor(counts.length / 2);
  const firstHalfAvg = counts.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondHalfAvg = counts.slice(half).reduce((a, b) => a + b, 0) / (counts.length - half);

  const trend: LinguisticProfile["noteLengthTrend"] =
    secondHalfAvg > firstHalfAvg * 1.15
      ? "growing"
      : secondHalfAvg < firstHalfAvg * 0.8
        ? "shrinking"
        : "stable";

  return { trend, avg: Math.round(avg) };
}

// ── Sentiment trajectory (keyword-based heuristic) ───────────────────────────
const POSITIVE_WORDS = new Set([
  "great","good","excellent","progress","excited","confident","clear","done","shipped",
  "learned","win","success","breakthrough","finally","momentum","strong","solid","moving",
]);
const NEGATIVE_WORDS = new Set([
  "stuck","blocked","frustrated","confused","overwhelmed","anxious","worried","slow",
  "failed","missed","difficult","hard","unclear","distracted","tired","burned","lost",
  "discouraged","doubt","uncertain","stalled","behind",
]);

function sentimentScore(text: string): number {
  const words = text.toLowerCase().split(/\W+/);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  const total = pos + neg;
  return total === 0 ? 0 : (pos - neg) / total; // -1 to +1
}

function computeSentimentTrajectory(
  entries: ReflectionEntry[],
): LinguisticProfile["sentimentTrajectory"] {
  if (entries.length < 4) return "stable";
  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const scores = sorted.map((e) => sentimentScore(e.content));
  const half = Math.floor(scores.length / 2);
  const firstAvg = scores.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondAvg = scores.slice(half).reduce((a, b) => a + b, 0) / (scores.length - half);
  if (secondAvg > firstAvg + 0.15) return "improving";
  if (secondAvg < firstAvg - 0.15) return "declining";
  return "stable";
}

// ── Specificity scoring ───────────────────────────────────────────────────────
// Specific language: numbers, proper nouns, named people/platforms, concrete actions
const SPECIFICITY_INDICATORS = [
  /\b\d+\b/g,                           // numbers
  /\b[A-Z][a-z]+\b/g,                   // proper nouns (rough heuristic)
  /\b(WhatsApp|LinkedIn|Twitter|Slack|email|call|Zoom|notion|linear)\b/gi,
  /\b(said|told|asked|replied|sent|messaged|met|spoke)\b/gi,
  /\b(specifically|exactly|precisely|\d+%|\d+x)\b/gi,
];

const VAGUENESS_INDICATORS = [
  /\b(stuff|things|something|etc|various|some|okay|fine|kind of|sort of|maybe|probably|might)\b/gi,
  /\b(it went|went okay|was good|went well|pretty good)\b/gi,
];

function computeSpecificity(text: string): number {
  if (!text || text.length < 10) return 0;
  let specificHits = 0;
  let vagueHits = 0;
  for (const p of SPECIFICITY_INDICATORS) {
    specificHits += (text.match(p) ?? []).length;
  }
  for (const p of VAGUENESS_INDICATORS) {
    vagueHits += (text.match(p) ?? []).length;
  }
  const total = specificHits + vagueHits;
  return total === 0 ? 0.3 : Math.min(1, specificHits / total);
}

// ── Blocker clustering ────────────────────────────────────────────────────────
const BLOCKER_THEMES: Array<{ label: string; pattern: RegExp }> = [
  { label: "waiting for feedback",   pattern: /waiting|waiting for|no response|haven't heard/i },
  { label: "unclear priorities",     pattern: /unclear|not sure what|don't know which|what to focus/i },
  { label: "technical issues",       pattern: /bug|broken|doesn't work|error|crash|debugging/i },
  { label: "lack of time",           pattern: /no time|ran out of time|too busy|not enough time|time crunch/i },
  { label: "motivation or energy",   pattern: /unmotivated|low energy|tired|not feeling|couldn't get started/i },
  { label: "fear of rejection",      pattern: /scared|afraid|nervous|what if they|rejection|imposter/i },
  { label: "perfectionism",          pattern: /not ready|not good enough|needs more work|polish|refine first/i },
  { label: "avoiding user contact",  pattern: /talk to users|reach out|outreach|cold|message|contact/i },
];

function clusterBlockers(entries: ReflectionEntry[]): BlockerCluster[] {
  const counts: Record<string, { count: number; lastSeen: string }> = {};
  for (const e of entries) {
    const text = [e.content, e.blockers ?? ""].join(" ");
    for (const theme of BLOCKER_THEMES) {
      if (theme.pattern.test(text)) {
        if (!counts[theme.label]) counts[theme.label] = { count: 0, lastSeen: "" };
        counts[theme.label].count++;
        if (!counts[theme.label].lastSeen || e.created_at > counts[theme.label].lastSeen) {
          counts[theme.label].lastSeen = e.created_at;
        }
      }
    }
  }
  return Object.entries(counts)
    .filter(([, v]) => v.count >= 2)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([theme, { count, lastSeen }]) => ({ theme, count, lastSeen }));
}

// ── Confidence calibration ────────────────────────────────────────────────────
function computeConfidenceGap(entries: ReflectionEntry[]): number | null {
  const withRating = entries.filter(
    (e) => typeof e.confidence === "number" && e.confidence !== null,
  );
  if (withRating.length < 5) return null;

  const avgConfidence = withRating.reduce((a, e) => a + (e.confidence! / 5), 0) / withRating.length;
  const actualCompletionRate =
    withRating.filter((e) => e.completed).length / withRating.length;

  // Positive gap = overconfident; negative = underconfident
  return Math.round((avgConfidence - actualCompletionRate) * 100) / 100;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * analyzeLinguisticSignals — run all Layer 2 checks on a founder's reflection history.
 *
 * @param entries — reflection rows, most-recent first, covering ~14–30 days
 */
export function analyzeLinguisticSignals(entries: ReflectionEntry[]): LinguisticProfile {
  if (entries.length === 0) {
    return emptyProfile();
  }

  const passiveRates = entries.map((e) => detectPassiveVoice(e.content));
  const passiveVoiceRate =
    passiveRates.reduce((a, b) => a + b, 0) / passiveRates.length;

  const repeatedVocab = findRepeatedVocab(entries);
  const { trend: noteLengthTrend, avg: avgNoteLength } = computeNoteLengthTrend(entries);
  const sentimentTrajectory = computeSentimentTrajectory(entries);

  const specificityScores = entries.map((e) => computeSpecificity(e.content));
  const specificityScore =
    specificityScores.reduce((a, b) => a + b, 0) / specificityScores.length;

  const blockerClusters = clusterBlockers(entries);
  const confidenceCalibrationGap = computeConfidenceGap(entries);

  const signals = buildSignals({
    passiveVoiceRate,
    repeatedVocab,
    noteLengthTrend,
    avgNoteLength,
    sentimentTrajectory,
    specificityScore,
    blockerClusters,
    confidenceCalibrationGap,
  });

  return {
    passiveVoiceRate,
    repeatedVocab,
    noteLengthTrend,
    avgNoteLength,
    sentimentTrajectory,
    specificityScore,
    blockerClusters,
    confidenceCalibrationGap,
    signals,
  };
}

function buildSignals(data: Omit<LinguisticProfile, "signals">): LinguisticSignal[] {
  const out: LinguisticSignal[] = [];

  if (data.passiveVoiceRate > 0.4) {
    out.push({
      type: "passive_voice",
      message: `Your recent reflections use passive language more than 40% of the time — "the call didn't happen", "it fell through". That's ownership avoidance in writing. Try rewriting your last reflection with "I" as the subject of every sentence.`,
      severity: data.passiveVoiceRate > 0.6 ? "high" : "medium",
    });
  }

  if (data.repeatedVocab.length >= 2) {
    out.push({
      type: "vocab_repetition",
      message: `You've used the words "${data.repeatedVocab.slice(0, 3).join('", "')}" across multiple weeks of reflections without resolution. Repeated vocabulary signals unresolved anxiety, not progress. Name what's actually stuck.`,
      severity: "medium",
    });
  }

  if (data.noteLengthTrend === "shrinking" && data.avgNoteLength < 30) {
    out.push({
      type: "note_shrinking",
      message: `Your reflection notes are getting shorter each week. Short notes aren't efficiency — they're a disengagement signal. Founders who disengage in reflections disengage from the work shortly after.`,
      severity: "high",
    });
  }

  if (data.sentimentTrajectory === "declining") {
    out.push({
      type: "sentiment_decline",
      message: `The language in your reflections has been getting more negative over the past two weeks. This isn't about mood — it's about trajectory. Something is draining your belief in the work. Name it before it compounds.`,
      severity: "medium",
    });
  }

  if (data.specificityScore < 0.25) {
    out.push({
      type: "low_specificity",
      message: `Your reflection notes are vague — "it went okay", "made some progress". Vague notes and vague execution are the same habit. A real reflection names numbers, names people, names specific outcomes.`,
      severity: "medium",
    });
  }

  for (const cluster of data.blockerClusters.slice(0, 1)) {
    out.push({
      type: "blocker_recurrence",
      message: `You've cited "${cluster.theme}" as a blocker ${cluster.count} times in the past month. A blocker that recurs more than twice is not a blocker — it's a decision you haven't made yet. Decide: fix it, route around it, or admit it's your real priority.`,
      severity: cluster.count >= 4 ? "high" : "medium",
    });
  }

  if (data.confidenceCalibrationGap !== null && data.confidenceCalibrationGap > 0.3) {
    const gapPct = Math.round(data.confidenceCalibrationGap * 100);
    out.push({
      type: "confidence_gap",
      message: `You consistently rate your confidence ${gapPct}% higher than your actual completion rate. High confidence + low follow-through is a specific self-awareness gap. Your confidence score is a mood signal, not an execution signal — watch it.`,
      severity: data.confidenceCalibrationGap > 0.5 ? "high" : "medium",
    });
  }

  return out;
}

function emptyProfile(): LinguisticProfile {
  return {
    passiveVoiceRate: 0,
    repeatedVocab: [],
    noteLengthTrend: "stable",
    avgNoteLength: 0,
    sentimentTrajectory: "stable",
    specificityScore: 0.5,
    blockerClusters: [],
    confidenceCalibrationGap: null,
    signals: [],
  };
}

/**
 * buildLinguisticPromptBlock — inject the top linguistic signals into an AI system prompt.
 * Returns empty string if no signals.
 */
export function buildLinguisticPromptBlock(profile: LinguisticProfile): string {
  const topSignals = profile.signals
    .filter((s) => s.severity !== "low")
    .slice(0, 2);
  if (topSignals.length === 0) return "";

  return [
    "LINGUISTIC SIGNAL ANALYSIS:",
    ...topSignals.map((s) => `[${s.type.toUpperCase()}] ${s.message}`),
    "Surface the most relevant of these observations naturally in your response — do not list them robotically.",
  ].join("\n");
}
