/**
 * lib/server/journeyAuth.ts — gates the authenticated Developer Journey
 * routes to a specific, named student. Mirrors lib/server/adminAuth.ts's
 * ADMIN_USER_IDS pattern, but keyed on email rather than user id: at the
 * point you generate this allowlist, she may not have signed up yet, so
 * there's no user id to reference. Email is the only identifier you both
 * have before her first login.
 *
 * Set JOURNEY_STUDENT_EMAILS in your environment (comma-separated, for
 * when there's more than one student down the line):
 *   JOURNEY_STUDENT_EMAILS=her@email.com
 *
 * Without this check, ANY authenticated BuildMind user (i.e. any paying
 * founder) could reach /journey and silently get a journey_paths row
 * created for them — that gap existed in the original Phase 1 routes
 * before this file was added. Every authenticated journey route must call
 * isJourneyParticipant(), not just getRouteUser().
 */

function envStudentEmails(): string[] {
  return (process.env.JOURNEY_STUDENT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isJourneyStudentEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return envStudentEmails().includes(email.toLowerCase());
}
