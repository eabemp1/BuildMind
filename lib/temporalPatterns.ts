/**
 * lib/temporalPatterns.ts — Layer 1: Temporal Pattern Detection
 *
 * Analyzes WHEN the founder works, not what they say about it.
 * Detects peak productivity windows, dropout times, streak fragility,
 * and week-over-week session length trends.
 *
 * Data source: activity_log (event timestamps) — read server-side only.
 *
 * Surface these signals in:
 *   - Morning briefing generation
 *   - Task scheduling (schedule tasks at peak hours)
 *   - Evening check nudge (warn if founder is in their typical dropout window)
 */

export interface SessionEvent {
  event_type: string;
  created_at: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}

export interface TemporalProfile {
  /** Hour of day (0-23) with highest completion rate */
  peakProductivityHour: number | null;
  /** Hour of day with highest session abandonment rate */
  dropoutHour: number | null;
  /** Days of week (0=Sun) with highest completion rate */
  peakDays: number[];
  /** Average session duration in minutes across last 14 days */
  avgSessionMinutes: number;
  /** Week-over-week session length trend: positive = getting longer */
  sessionLengthTrend: "growing" | "shrinking" | "stable";
  /** Whether founder checks in but rarely completes */
  streakFragility: "fragile" | "solid" | "unknown";
  /** Completion rate by hour bucket */
  completionByHour: Record<number, number>;
  /** Days since last activity */
  daysSinceLastActivity: number;
  /** Human-readable insight to surface */
  insight: string | null;
}

/**
 * parseHour — extract local hour from ISO timestamp.
 * Uses UTC here; caller should adjust with founder's timezone_offset if available.
 */
function parseHour(iso: string): number {
  return new Date(iso).getUTCHours();
}

function parseDay(iso: string): number {
  return new Date(iso).getUTCDay();
}

function parseDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * buildTemporalProfile — compute a founder's temporal work pattern from raw activity events.
 *
 * @param events   — rows from activity_log ordered by created_at desc, last 30 days
 * @param tzOffset — founder's timezone offset in hours (default 0 = UTC)
 */
export function buildTemporalProfile(
  events: SessionEvent[],
  tzOffset = 0,
): TemporalProfile {
  if (events.length === 0) {
    return emptyProfile();
  }

  // Adjust timestamps for founder timezone
  const adjusted = events.map((e) => ({
    ...e,
    localHour: (parseHour(e.created_at) + tzOffset + 24) % 24,
    localDay: parseDay(e.created_at),
    dateKey: parseDateKey(e.created_at),
  }));

  // ── Peak productivity hour ──────────────────────────────────────────────
  const completionsByHour: Record<number, number> = {};
  const checkinsByHour: Record<number, number> = {};

  for (const e of adjusted) {
    checkinsByHour[e.localHour] = (checkinsByHour[e.localHour] ?? 0) + 1;
    if (e.event_type === "task_completed" || e.event_type === "reflection_done") {
      completionsByHour[e.localHour] = (completionsByHour[e.localHour] ?? 0) + 1;
    }
  }

  // Completion RATE per hour (completions / checkins at that hour)
  const completionRateByHour: Record<number, number> = {};
  for (const [hourStr, checkins] of Object.entries(checkinsByHour)) {
    const hour = Number(hourStr);
    const completions = completionsByHour[hour] ?? 0;
    completionRateByHour[hour] = checkins > 0 ? completions / checkins : 0;
  }

  const hoursWithData = Object.entries(completionRateByHour)
    .filter(([, rate]) => rate > 0)
    .sort(([, a], [, b]) => b - a);

  const peakProductivityHour = hoursWithData[0] ? Number(hoursWithData[0][0]) : null;

  // ── Dropout hour — sessions started but no completion that hour ────────
  const abandonedByHour: Record<number, number> = {};
  for (const e of adjusted) {
    if (e.event_type === "task_accepted" || e.event_type === "login") {
      const hour = e.localHour;
      const completed = completionsByHour[hour] ?? 0;
      const started = checkinsByHour[hour] ?? 0;
      if (started > completed) {
        abandonedByHour[hour] = (abandonedByHour[hour] ?? 0) + 1;
      }
    }
  }
  const dropoutEntries = Object.entries(abandonedByHour).sort(([, a], [, b]) => b - a);
  const dropoutHour = dropoutEntries[0] ? Number(dropoutEntries[0][0]) : null;

  // ── Peak days ──────────────────────────────────────────────────────────
  const completionsByDay: Record<number, number> = {};
  for (const e of adjusted) {
    if (e.event_type === "task_completed" || e.event_type === "reflection_done") {
      completionsByDay[e.localDay] = (completionsByDay[e.localDay] ?? 0) + 1;
    }
  }
  const peakDays = Object.entries(completionsByDay)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([d]) => Number(d));

  // ── Session duration (approximate: gap between first and last event per day) ──
  const eventsByDay: Record<string, number[]> = {};
  for (const e of adjusted) {
    if (!eventsByDay[e.dateKey]) eventsByDay[e.dateKey] = [];
    eventsByDay[e.dateKey].push(new Date(e.created_at).getTime());
  }

  const sessionDurations: number[] = [];
  for (const times of Object.values(eventsByDay)) {
    if (times.length < 2) continue;
    const min = Math.min(...times);
    const max = Math.max(...times);
    sessionDurations.push((max - min) / 60000); // ms → minutes
  }

  const avgSessionMinutes =
    sessionDurations.length > 0
      ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length)
      : 0;

  // ── Week-over-week trend ───────────────────────────────────────────────
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thisWeekKeys = new Set(
    adjusted
      .filter((e) => now - new Date(e.created_at).getTime() < sevenDays)
      .map((e) => e.dateKey),
  );
  const lastWeekKeys = new Set(
    adjusted
      .filter((e) => {
        const age = now - new Date(e.created_at).getTime();
        return age >= sevenDays && age < 2 * sevenDays;
      })
      .map((e) => e.dateKey),
  );

  function avgDuration(dayKeys: Set<string>): number {
    const durations = [...dayKeys]
      .map((k) => eventsByDay[k])
      .filter(Boolean)
      .map((times) => {
        const min = Math.min(...times!);
        const max = Math.max(...times!);
        return (max - min) / 60000;
      });
    return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }

  const thisWeekAvg = avgDuration(thisWeekKeys);
  const lastWeekAvg = avgDuration(lastWeekKeys);
  const sessionLengthTrend: TemporalProfile["sessionLengthTrend"] =
    lastWeekAvg === 0
      ? "stable"
      : thisWeekAvg > lastWeekAvg * 1.1
        ? "growing"
        : thisWeekAvg < lastWeekAvg * 0.85
          ? "shrinking"
          : "stable";

  // ── Streak fragility — checks without completions ──────────────────────
  const checkinDays = new Set(
    adjusted.filter((e) => e.event_type !== "login").map((e) => e.dateKey),
  );
  const completionDays = new Set(
    adjusted
      .filter((e) => e.event_type === "task_completed" || e.event_type === "reflection_done")
      .map((e) => e.dateKey),
  );
  const daysCheckedInWithoutCompletion = [...checkinDays].filter(
    (d) => !completionDays.has(d),
  ).length;
  const streakFragility: TemporalProfile["streakFragility"] =
    checkinDays.size === 0
      ? "unknown"
      : daysCheckedInWithoutCompletion / Math.max(1, checkinDays.size) > 0.4
        ? "fragile"
        : "solid";

  // ── Days since last activity ───────────────────────────────────────────
  const lastEvent = events[0]; // already sorted desc
  const daysSinceLastActivity = lastEvent
    ? Math.floor((Date.now() - new Date(lastEvent.created_at).getTime()) / 86400000)
    : 999;

  // ── Human-readable insight ─────────────────────────────────────────────
  const insight = buildTemporalInsight({
    peakProductivityHour,
    dropoutHour,
    sessionLengthTrend,
    streakFragility,
    avgSessionMinutes,
    daysSinceLastActivity,
  });

  return {
    peakProductivityHour,
    dropoutHour,
    peakDays,
    avgSessionMinutes,
    sessionLengthTrend,
    streakFragility,
    completionByHour: completionRateByHour,
    daysSinceLastActivity,
    insight,
  };
}

function emptyProfile(): TemporalProfile {
  return {
    peakProductivityHour: null,
    dropoutHour: null,
    peakDays: [],
    avgSessionMinutes: 0,
    sessionLengthTrend: "stable",
    streakFragility: "unknown",
    completionByHour: {},
    daysSinceLastActivity: 0,
    insight: null,
  };
}

function formatHour(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
}

function buildTemporalInsight(data: {
  peakProductivityHour: number | null;
  dropoutHour: number | null;
  sessionLengthTrend: TemporalProfile["sessionLengthTrend"];
  streakFragility: TemporalProfile["streakFragility"];
  avgSessionMinutes: number;
  daysSinceLastActivity: number;
}): string | null {
  const parts: string[] = [];

  if (data.peakProductivityHour !== null) {
    parts.push(
      `You complete tasks before ${formatHour(data.peakProductivityHour + 1)} more than any other time. ` +
        `Schedule your hardest task there.`,
    );
  }

  if (data.dropoutHour !== null && data.dropoutHour !== data.peakProductivityHour) {
    parts.push(
      `You tend to start but not finish work around ${formatHour(data.dropoutHour)}. ` +
        `Avoid scheduling new tasks at that time.`,
    );
  }

  if (data.sessionLengthTrend === "shrinking" && data.avgSessionMinutes < 20) {
    parts.push(
      `Your work sessions are getting shorter week over week. ` +
        `Sessions under 20 minutes rarely produce completions. This is an early churn signal.`,
    );
  }

  if (data.streakFragility === "fragile") {
    parts.push(
      `You open the app most days but don't complete tasks. ` +
        `Checking in without finishing creates an illusion of progress. One real completion beats five check-ins.`,
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * buildTemporalPromptBlock — inject temporal pattern into AI system prompt.
 */
export function buildTemporalPromptBlock(profile: TemporalProfile): string {
  if (!profile.insight && profile.peakProductivityHour === null) return "";
  const lines: string[] = ["TEMPORAL PATTERN DATA:"];
  if (profile.peakProductivityHour !== null) {
    lines.push(`- Peak productivity hour: ${formatHour(profile.peakProductivityHour)}`);
  }
  if (profile.dropoutHour !== null) {
    lines.push(`- Dropout risk hour: ${formatHour(profile.dropoutHour)}`);
  }
  if (profile.sessionLengthTrend !== "stable") {
    lines.push(`- Session length trend: ${profile.sessionLengthTrend}`);
  }
  if (profile.streakFragility !== "unknown") {
    lines.push(`- Streak fragility: ${profile.streakFragility}`);
  }
  if (profile.insight) {
    lines.push(`- Key insight: ${profile.insight}`);
  }
  return lines.join("\n");
}
