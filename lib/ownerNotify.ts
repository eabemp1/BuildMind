/**
 * lib/ownerNotify.ts — tells the founder what happened, without spamming.
 *
 * Policy (pure, tested): the first N signups ping instantly; after that only
 * milestones ping, and everything else rolls into the daily digest.
 * Channels (all optional, any combination): ntfy push, Telegram, email.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export interface OwnerMessage {
  title: string;
  body: string;
  priority?: "low" | "default" | "high";
  url?: string;
}

export function ownerChannels() {
  return {
    ntfy: Boolean(process.env.OWNER_NTFY_TOPIC),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    email: Boolean(process.env.OWNER_EMAIL),
  };
}

async function post(url: string, init: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Sends to every configured channel. Never throws. Returns channels that accepted. */
export async function notifyOwner(msg: OwnerMessage): Promise<string[]> {
  const sent: string[] = [];
  const jobs: Promise<void>[] = [];
  const topic = process.env.OWNER_NTFY_TOPIC;
  if (topic) {
    jobs.push(
      post(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: "POST",
        headers: {
          Title: msg.title.replace(/[^\x20-\x7E]/g, ""),
          Priority: msg.priority === "high" ? "high" : msg.priority === "low" ? "low" : "default",
          ...(msg.url ? { Click: msg.url } : {}),
        },
        body: msg.body,
      }).then((ok) => { if (ok) sent.push("ntfy"); }),
    );
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    jobs.push(
      post(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: `${msg.title}\n${msg.body}${msg.url ? `\n${msg.url}` : ""}` }),
      }).then((ok) => { if (ok) sent.push("telegram"); }),
    );
  }
  const to = process.env.OWNER_EMAIL;
  if (to) {
    jobs.push(
      sendEmail({ to, subject: msg.title, html: `<p>${esc(msg.body).replace(/\n/g, "<br>")}</p>${msg.url ? `<p><a href="${esc(msg.url)}">${esc(msg.url)}</a></p>` : ""}`, text: msg.body })
        .then((r) => { if (r.ok && !r.skipped) sent.push("email"); }, () => {}),
    );
  }
  await Promise.all(jobs);
  return sent;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Policy ──────────────────────────────────────────────────────────────

export function instantLimit(): number {
  const n = Number(process.env.OWNER_INSTANT_SIGNUPS);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

const MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

export function isMilestone(n: number): boolean {
  return MILESTONES.includes(n);
}

export interface SignupPlan {
  alert: boolean;
  title: string;
  body: string;
}

/**
 * `total` = total users now; `pending` = signups not yet reported (oldest first).
 * One message per flush, however many signups are pending.
 */
export function planSignupAlerts(total: number, pending: { email?: string | null; provider?: string | null }[], limit = instantLimit()): SignupPlan {
  if (pending.length === 0) return { alert: false, title: "", body: "" };
  const firstNumber = total - pending.length + 1;
  const crossed = MILESTONES.find((m) => m >= firstNumber && m <= total);
  const instant = firstNumber <= limit || crossed !== undefined;
  const who = pending
    .slice(0, 5)
    .map((p) => `${maskEmail(p.email)}${p.provider ? ` (${p.provider})` : ""}`)
    .join(", ");
  const more = pending.length > 5 ? ` +${pending.length - 5} more` : "";
  if (crossed !== undefined) {
    return { alert: true, title: `BuildMind hit ${crossed} users`, body: `${total} founders have joined. Latest: ${who}${more}` };
  }
  return {
    alert: instant,
    title: pending.length === 1 ? `New signup #${total}` : `${pending.length} new signups (${total} total)`,
    body: `${who}${more}`,
  };
}

export function maskEmail(email?: string | null): string {
  if (!email) return "someone";
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}***@${domain}`;
}

export interface DigestInput {
  signups: number;
  upgrades: number;
  incidents: number;
  totalUsers: number;
}

export function buildDigest(d: DigestInput): OwnerMessage | null {
  if (!d.signups && !d.upgrades && !d.incidents) return null;
  const parts = [
    `${d.signups} new signup${d.signups === 1 ? "" : "s"}`,
    `${d.upgrades} upgrade${d.upgrades === 1 ? "" : "s"}`,
    d.incidents ? `${d.incidents} incident${d.incidents === 1 ? "" : "s"}` : "no incidents",
  ];
  return { title: "BuildMind daily digest", body: `${parts.join(" · ")}\nTotal users: ${d.totalUsers}`, priority: "low", url: "https://buildmind.live/admin" };
}

// ── Flush ───────────────────────────────────────────────────────────────

/**
 * Claims un-notified signup events atomically (UPDATE ... WHERE notified_at IS NULL
 * returns only rows this call won), then alerts per policy. Safe to call from
 * many requests at once. Never throws.
 */
export async function flushOwnerEvents(): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: claimed } = await admin
      .from("owner_events")
      .update({ notified_at: new Date().toISOString() })
      .is("notified_at", null)
      .eq("kind", "signup")
      .select("id, payload");
    if (!claimed || claimed.length === 0) return;
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });
    const total = count ?? claimed.length;
    const plan = planSignupAlerts(
      total,
      claimed.map((c: { payload: { email?: string; provider?: string } }) => c.payload ?? {}),
    );
    if (plan.alert) await notifyOwner({ title: plan.title, body: plan.body, url: "https://buildmind.live/admin#signups" });
  } catch (err) {
    console.error("[ownerNotify] flush failed", err);
  }
}

/** Records an event (upgrade, outage…) and notifies immediately. Never throws. */
export async function recordOwnerEvent(kind: string, payload: Record<string, unknown>, alert?: OwnerMessage, userId?: string) {
  try {
    const admin = createAdminClient();
    await admin.from("owner_events").insert({ kind, user_id: userId ?? null, payload, notified_at: new Date().toISOString() });
  } catch { /* ignore */ }
  if (alert) await notifyOwner(alert);
}
