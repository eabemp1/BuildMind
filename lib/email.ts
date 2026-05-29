/**
 * lib/email.ts — BuildMind transactional email via Resend
 *
 * Usage:
 *   import { sendEmail, EmailTemplate } from "@/lib/email";
 *   await sendEmail({ to: user.email, template: "subscription_confirmed", data: { ... } });
 *
 * Templates:
 *   welcome              — first sign-up (Supabase auth triggers this via webhook, optional)
 *   subscription_confirmed — paid, plan activated
 *   subscription_cancelled — downgraded to free
 *   subscription_welcome  — first email after paying (different tone from confirmed)
 *
 * All emails are plain HTML — no external CSS framework, no images, no tracking pixels.
 * The design matches BuildMind's obsidian + celadon green aesthetic.
 *
 * Resend free tier: 3,000 emails/month, 100/day. Sufficient until ~500 paying users.
 * Pricing at scale: $20/mo for 50k emails.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

const FROM = process.env.EMAIL_FROM ?? "BuildMind <hello@buildmind.live>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";

// ─── Base HTML shell ──────────────────────────────────────────────────────────
function shell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="dark" />
<title>BuildMind</title>
</head>
<body style="margin:0;padding:0;background:#0F0F10;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F10;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo / wordmark -->
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#3A3A42;">BuildMind</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#161618;border:1px solid #222226;border-radius:16px;padding:40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;text-align:left;">
              <p style="margin:0;font-size:12px;color:#3A3A42;line-height:1.6;">
                You received this because you have an account at
                <a href="${APP_URL}" style="color:#3A3A42;text-decoration:underline;">buildmind.live</a>.
                &nbsp;·&nbsp;
                <a href="${APP_URL}/settings" style="color:#3A3A42;text-decoration:underline;">Email preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Shared primitives ────────────────────────────────────────────────────────
const h1 = (text: string) =>
  `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ECECEC;letter-spacing:-0.03em;line-height:1.2;">${text}</h1>`;

const subhead = (text: string) =>
  `<p style="margin:0 0 28px;font-size:14px;color:#56565E;line-height:1.6;">${text}</p>`;

const body = (text: string) =>
  `<p style="margin:0 0 20px;font-size:14px;color:#909096;line-height:1.7;">${text}</p>`;

const cta = (text: string, href: string) =>
  `<a href="${href}" style="display:inline-block;background:#5CC88A;color:#0F0F10;font-size:13px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:10px;letter-spacing:0.01em;">${text}</a>`;

const divider = () =>
  `<hr style="border:none;border-top:1px solid #222226;margin:28px 0;" />`;

const pill = (text: string, color = "#5CC88A") =>
  `<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:${color}18;border:1px solid ${color}33;color:${color};">${text}</span>`;

const kv = (label: string, value: string) =>
  `<tr>
    <td style="padding:8px 0;font-size:12px;color:#56565E;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:13px;color:#ECECEC;font-weight:500;">${value}</td>
  </tr>`;

// ─── Templates ────────────────────────────────────────────────────────────────

function subscriptionConfirmedHTML(data: { name?: string; plan: string; amount: string; reference: string; date: string }): string {
  const displayName = data.name ?? "Founder";
  return shell(`
    <div style="margin-bottom:20px;">${pill("Builder Plan Activated")}</div>
    ${h1("You're in.")}
    ${subhead("Your BuildMind Builder subscription is now active.")}
    ${body(`Welcome, ${displayName}. You now have unlimited AI calls, full Reflexion loop access, weekly strategy reports, and every feature BuildMind ships from here.`)}
    <div style="text-align:left;margin-bottom:28px;">
      ${cta("Open your workspace →", `${APP_URL}/today`)}
    </div>
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${kv("Plan", "Builder")}
      ${kv("Amount", data.amount)}
      ${kv("Date", data.date)}
      ${kv("Reference", `<span style="font-family:monospace;font-size:11px;">${data.reference}</span>`)}
    </table>
    ${divider()}
    ${body(`Your daily action will be ready tomorrow morning. Today, explore your workspace — your AI already knows your stage, your users, and your blockers.`)}
  `);
}

function subscriptionCancelledHTML(data: { name?: string; reason?: string; cancelDate: string; accessUntil?: string }): string {
  const displayName = data.name ?? "Founder";
  return shell(`
    <div style="margin-bottom:20px;">${pill("Subscription Cancelled", "#E8A020")}</div>
    ${h1("Subscription cancelled.")}
    ${subhead("Your BuildMind Builder plan has been cancelled.")}
    ${body(`Hi ${displayName}, we've processed your cancellation. Here's what happens next:`)}
    <div style="background:#1C1C1F;border:1px solid #2C2C31;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:13px;color:#ECECEC;font-weight:600;">What stays:</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#909096;line-height:1.9;">
        <li>Your projects, reflections, and all your data</li>
        <li>Free tier access (3 AI calls/day)</li>
        <li>Your streak history</li>
      </ul>
      <p style="margin:14px 0 10px;font-size:13px;color:#ECECEC;font-weight:600;">What changes:</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#909096;line-height:1.9;">
        <li>Unlimited AI calls → 3/day</li>
        <li>Weekly reports → paused</li>
        <li>Full Reflexion loop → limited</li>
      </ul>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${kv("Cancelled on", data.cancelDate)}
      ${data.accessUntil ? kv("Builder access until", data.accessUntil) : ""}
      ${data.reason ? kv("Reason recorded", `<em style="color:#56565E;">${data.reason}</em>`) : ""}
    </table>
    ${divider()}
    ${body("If you cancelled by mistake or want to resubscribe, you can do it in one click — your data and history will be exactly where you left it.")}
    <div style="text-align:left;margin-bottom:4px;">
      ${cta("Resubscribe →", `${APP_URL}/upgrade`)}
    </div>
  `);
}

function welcomeHTML(data: { name?: string }): string {
  const displayName = data.name ?? "Founder";
  return shell(`
    ${h1(`Welcome, ${displayName}.`)}
    ${subhead("Your BuildMind workspace is ready.")}
    ${body("Your first daily action is available now. Open your workspace when you're ready and BuildMind will show the next focused task for your current startup stage.")}
    <div style="text-align:left;margin-bottom:28px;">
      ${cta("Open BuildMind", `${APP_URL}/today`)}
    </div>
    ${divider()}
    ${body("This email confirms your account setup. You can manage your profile and email preferences from Settings at any time.")}
  `);
}

function welcomeText(data: { name?: string }): string {
  const displayName = data.name ?? "Founder";
  return [
    `Welcome, ${displayName}.`,
    "",
    "Your BuildMind workspace is ready.",
    "Your first daily action is available now.",
    "",
    `Open BuildMind: ${APP_URL}/today`,
    "",
    "This email confirms your account setup. You can manage your profile and email preferences from Settings.",
  ].join("\n");
}


function weeklyBehavioralReviewHTML(data: TemplateData["weekly_behavioral_review"]): string {
  const name = data.name ? data.name.split(" ")[0] : "Founder";
  const startup = data.startupName ?? "your startup";
  const momentumChange = data.momentumEnd - data.momentumStart;
  const momentumArrow = momentumChange >= 0 ? "↑" : "↓";
  const momentumColor = momentumChange >= 0 ? "#5CC88A" : "#E8A020";
  const weekLabel = data.weekNumber ? `Week ${data.weekNumber}` : "This week";

  return shell(`
    <div style="margin-bottom:20px;">${pill(`${weekLabel} in BuildMind`)}</div>
    ${h1(`${name}, here's your week.`)}
    ${subhead(`${startup} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`)}

    <!-- Momentum card -->
    <div style="background:#1C1C1F;border:1px solid #222226;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#56565E;">Momentum</span>
        <span style="font-size:13px;font-weight:700;color:${momentumColor};">${momentumArrow} ${Math.abs(momentumChange)} pts</span>
      </div>
      <div style="display:flex;gap:24px;">
        <div>
          <div style="font-size:28px;font-weight:800;color:#ECECEC;letter-spacing:-0.04em;">${data.momentumEnd}</div>
          <div style="font-size:11px;color:#56565E;margin-top:2px;">Score now</div>
        </div>
        <div style="border-left:1px solid #222226;padding-left:24px;">
          <div style="font-size:13px;font-weight:600;color:#ECECEC;">${data.tasksCompleted} tasks</div>
          <div style="font-size:11px;color:#56565E;margin-top:2px;">completed</div>
        </div>
        ${data.streak > 0 ? `<div style="border-left:1px solid #222226;padding-left:24px;">
          <div style="font-size:13px;font-weight:600;color:#E8A020;">🔥 ${data.streak} days</div>
          <div style="font-size:11px;color:#56565E;margin-top:2px;">streak</div>
        </div>` : ""}
      </div>
    </div>

    ${data.avoidancePattern ? `
    <!-- Behavioral signal -->
    <div style="background:#161618;border-left:3px solid #E8A02033;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#56565E;">Pattern detected</p>
      <p style="margin:0;font-size:13px;color:#ECECEC;line-height:1.6;">${data.avoidancePattern}</p>
    </div>
    ` : ""}

    ${data.nextWeekFocus ? `
    ${body(`<strong style="color:#ECECEC;">Next week:</strong> ${data.nextWeekFocus}`)}
    ` : ""}

    <div style="text-align:left;margin-bottom:28px;">
      ${cta("See full report →", `${APP_URL}/reports`)}
    </div>
    ${divider()}
    ${body("This summary was generated by BuildMind's behavioral analysis. It updates every week based on what you actually do, not what you plan to do.")}
  `);
}

// ─── Template map ─────────────────────────────────────────────────────────────
export type EmailTemplate =
  | "welcome"
  | "subscription_confirmed"
  | "subscription_cancelled"
  | "re_engagement"
  | "weekly_behavioral_review";

type TemplateData = {
  welcome: { name?: string };
  subscription_confirmed: { name?: string; plan: string; amount: string; reference: string; date: string };
  subscription_cancelled: { name?: string; reason?: string; cancelDate: string; accessUntil?: string };
  re_engagement: { name?: string; daysInactive: number; startupName?: string; lastActionDate?: string };
  weekly_behavioral_review: {
    name?: string;
    startupName?: string;
    tasksCompleted: number;
    momentumStart: number;
    momentumEnd: number;
    streak: number;
    avoidancePattern?: string;
    nextWeekFocus?: string;
    weekNumber?: number;
  };
};

function reEngagementHTML(data: TemplateData["re_engagement"]): string {
  const name = data.name ? data.name.split(" ")[0] : "founder";
  const startup = data.startupName ? `your ${data.startupName} project` : "your startup";
  const days = data.daysInactive ?? 7;
  return shell(`
    ${h1(`${days} days. The window is still open.`)}
    ${subhead(`You haven't logged any progress on ${startup} in ${days} days.`)}
    <p style="margin:16px 0 0;font-size:14px;color:#9D9DA8;line-height:1.7;">
      ${name}, most founders who go quiet for a week never come back. Not because they failed — because they got comfortable with not shipping.
    </p>
    <p style="margin:12px 0 0;font-size:14px;color:#9D9DA8;line-height:1.7;">
      You don't need to catch up. You just need one action today. BuildMind already knows where you were.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td>
          <a href="${APP_URL}/today" style="display:inline-block;padding:13px 28px;background:#22C55E;color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">
            Resume where you left off →
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#3A3A42;line-height:1.6;">
      If you've moved on from this project, that's valid too — you can archive it in Settings and start fresh.
    </p>
  `);
}

function buildHTML<T extends EmailTemplate>(template: T, data: TemplateData[T]): { html: string; subject: string } {
  switch (template) {
    case "welcome":
      return {
        subject: "Your BuildMind workspace is ready",
        html: welcomeHTML(data as TemplateData["welcome"]),
      };
    case "subscription_confirmed":
      return {
        subject: "Builder plan activated — you're in ✓",
        html: subscriptionConfirmedHTML(data as TemplateData["subscription_confirmed"]),
      };
    case "subscription_cancelled":
      return {
        subject: "Your BuildMind subscription has been cancelled",
        html: subscriptionCancelledHTML(data as TemplateData["subscription_cancelled"]),
      };
    case "re_engagement":
      return {
        subject: `${(data as TemplateData["re_engagement"]).daysInactive} days since your last session — come back today`,
        html: reEngagementHTML(data as TemplateData["re_engagement"]),
      };
    case "weekly_behavioral_review": {
      const d = data as TemplateData["weekly_behavioral_review"];
      const change = d.momentumEnd - d.momentumStart;
      const dir = change >= 0 ? `↑${change}` : `↓${Math.abs(change)}`;
      return {
        subject: `Your week in BuildMind — ${d.tasksCompleted} tasks, momentum ${dir}`,
        html: weeklyBehavioralReviewHTML(d),
      };
    }
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// ─── Send function ────────────────────────────────────────────────────────────
export interface SendEmailOptions<T extends EmailTemplate> {
  to: string;
  template?: T;
  data?: TemplateData[T];
  subject?: string;
  html?: string;
  text?: string;
  /** Override the auto-generated subject line */
  subjectOverride?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * sendEmail — sends a transactional email via Resend.
 *
 * - Returns { ok: true, skipped: true } in development (no RESEND_API_KEY)
 *   so local dev never accidentally sends real emails.
 * - All errors are caught and returned as { ok: false, error } — never throws.
 *   Billing routes should send email best-effort and never block on it.
 */
export async function sendEmail<T extends EmailTemplate>(
  options: SendEmailOptions<T>,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  // Dev / missing key — log to console and skip silently
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] SKIPPED (no RESEND_API_KEY) — would send "${options.template}" to ${options.to}`);
    } else {
      console.error(
        `[email] CRITICAL: RESEND_API_KEY not set — "${options.template}" email to ${options.to} was NOT sent. ` +
        `Users will not receive billing confirmations. Set RESEND_API_KEY in Vercel immediately.`
      );
    }
    return { ok: true, skipped: true };
  }

  try {
    const { html, subject } = options.template && options.data
      ? buildHTML(options.template, options.data)
      : { html: options.html ?? "", subject: options.subject ?? options.subjectOverride ?? "BuildMind" };
    const text = options.text ??
      (options.template === "welcome" && options.data
        ? welcomeText(options.data as TemplateData["welcome"])
        : undefined);

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [options.to],
        subject: options.subjectOverride ?? options.subject ?? subject,
        html,
        ...(text ? { text } : {}),
      }),
    });

    const json = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string };

    if (!res.ok) {
      console.error(`[email] Resend API error ${res.status} for ${options.template} → ${options.to}:`, json);
      return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    }

    console.log(`[email] Sent "${options.template}" to ${options.to} — id: ${json.id}`);
    return { ok: true, id: json.id };

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[email] Failed to send "${options.template}" to ${options.to}:`, message);
    return { ok: false, error: message };
  }
}
