/**
 * lib/signupGuard.ts - pure rules that make signups on a hosted page harder to fake.
 *
 *  - Throwaway email domains are refused.
 *  - A signup counts only after the person clicks the link in the confirmation email (double opt-in).
 *  - One device counts at most MAX_PER_VISITOR times, and a burst of signups in a few minutes is capped,
 *    because real interest arrives spread out and a person typing their own emails does not.
 *
 * None of this stops someone with many real inboxes and a lot of patience. It makes the cheap fakes
 * (one person, one device, many made-up addresses) not count.
 */

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "grr.la",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmailo.com",
  "yopmail.com", "yopmail.net", "trashmail.com", "trashmail.net", "throwawaymail.com", "getnada.com", "nada.email",
  "dispostable.com", "maildrop.cc", "mailnesia.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com",
  "burnermail.io", "spamgourmet.com", "mytemp.email", "tempinbox.com", "inboxkitten.com", "mailcatch.com", "moakt.com",
  "discard.email", "fakemail.net", "e4ward.com", "tmpmail.org", "tmpmail.net", "dropmail.me", "emailfake.com", "mail.tm",
  "1secmail.com", "1secmail.net", "tempr.email", "spambox.us", "mailsac.com", "harakirimail.com", "33mail.com",
]);

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function isDisposableEmail(email: string): boolean {
  const d = emailDomain(email);
  if (!d) return false;
  if (DISPOSABLE.has(d)) return true;
  // Subdomains of a throwaway provider (x.mailinator.com).
  for (const bad of DISPOSABLE) if (d.endsWith(`.${bad}`)) return true;
  return false;
}

export const MAX_PER_VISITOR = 2;
/** A person who signs up many people from one device is not many people. Requests to start one are refused past this. */
export const MAX_ATTEMPTS_PER_VISITOR = 4;
export const BURST_WINDOW_MS = 10 * 60 * 1000;
export const BURST_CAP = 5;

export interface SignupRow {
  visitor_hash: string | null;
  confirmed_at: string | null;
}

/** How many signups to count: confirmed only, capped per device and per 10-minute burst. */
export function countSignups(rows: SignupRow[]): number {
  const confirmed = (rows ?? [])
    .filter((r) => r && r.confirmed_at && Number.isFinite(Date.parse(r.confirmed_at)))
    .sort((a, b) => Date.parse(a.confirmed_at!) - Date.parse(b.confirmed_at!));
  const perVisitor = new Map<string, number>();
  const perBucket = new Map<number, number>();
  let n = 0;
  for (const r of confirmed) {
    if (r.visitor_hash) {
      const used = perVisitor.get(r.visitor_hash) ?? 0;
      if (used >= MAX_PER_VISITOR) continue;
      perVisitor.set(r.visitor_hash, used + 1);
    }
    const bucket = Math.floor(Date.parse(r.confirmed_at!) / BURST_WINDOW_MS);
    const inBucket = perBucket.get(bucket) ?? 0;
    if (inBucket >= BURST_CAP) continue;
    perBucket.set(bucket, inBucket + 1);
    n++;
  }
  return n;
}
