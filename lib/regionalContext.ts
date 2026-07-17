/**
 * lib/regionalContext.ts — Founder Context Engine (regional layer)
 *
 * DESIGN PRINCIPLE (carried over from the earlier discussion in this thread):
 * this is ONE parameterized lookup table that every AI prompt reads from —
 * not a fork into "African mode" / "US mode" / etc. Adding a new country
 * means adding one entry here, not building a new code path anywhere.
 *
 * HONESTY NOTE: I'm confident about the well-established facts below
 * (dominant payment rails, dominant informal-commerce channels) — these are
 * slow-changing and well-documented. I'm intentionally NOT including
 * volatile claims (specific accelerator application deadlines, funding
 * amounts, "X company just raised $Y") because that data goes stale fast and
 * I have no live source keeping it current — the exact overreach flagged
 * earlier as unrealistic for a solo founder to maintain. You know your
 * ecosystem better than I do — treat every entry here as a draft to correct,
 * not a finished authority.
 */

export interface RegionalContext {
  countryName: string;
  paymentRails: string[];
  distributionChannels: string[];
  fundingEcosystem: string[];
  advisoryNotes: string[];
}

const REGIONAL_CONTEXT: Record<string, RegionalContext> = {
  GH: {
    countryName: "Ghana",
    paymentRails: ["MTN Mobile Money", "Vodafone Cash", "AirtelTigo Money"],
    distributionChannels: ["WhatsApp Business", "Facebook groups/Marketplace", "Twitter/X"],
    fundingEcosystem: ["MEST Africa", "Norrsken Foundation", "Ventures Platform (regional)"],
    advisoryNotes: [
      "Mobile money is often the default payment expectation, not cards — advice assuming card checkout by default may not fit the customer's actual habits.",
      "Data costs are a real constraint for end users — lightweight, low-bandwidth distribution (WhatsApp, SMS) often outperforms media-heavy campaigns.",
    ],
  },
  NG: {
    countryName: "Nigeria",
    paymentRails: ["Bank transfer (USSD/apps)", "Paystack/Flutterwave-native checkout", "Mobile money (growing)"],
    distributionChannels: ["WhatsApp Business", "Twitter/X (very active startup community)", "Instagram for commerce"],
    fundingEcosystem: ["CcHub", "Ventures Platform", "Techstars Lagos"],
    advisoryNotes: [
      "Bank transfer is often preferred over cards for larger transactions — trust in the payment flow matters as much as the flow itself.",
    ],
  },
  KE: {
    countryName: "Kenya",
    paymentRails: ["M-Pesa (dominant, not optional to support)"],
    distributionChannels: ["WhatsApp Business", "SMS-based flows still relevant outside Nairobi"],
    fundingEcosystem: ["Antler East Africa", "iHub", "Villgro Africa"],
    advisoryNotes: [
      "A payment flow that doesn't support M-Pesa is a non-starter for most consumer products here — this is closer to a requirement than a feature.",
    ],
  },
  ZA: {
    countryName: "South Africa",
    paymentRails: ["Cards (more card-native than most of the continent)", "EFT", "SnapScan/Zapper for informal commerce"],
    distributionChannels: ["WhatsApp", "Facebook", "LinkedIn (more B2B-active than other regional markets)"],
    fundingEcosystem: ["Startupbootcamp Cape Town", "AlphaCode", "Endeavor South Africa"],
    advisoryNotes: [],
  },
};

/** Generic fallback for any country not explicitly listed — keeps this scalable
 *  to any market without needing an entry for every country up front. */
const GLOBAL_DEFAULT: RegionalContext = {
  countryName: "your market",
  paymentRails: ["Cards", "Local bank transfer where relevant"],
  distributionChannels: ["Whatever channel your specific ICP actually spends time in — don't default to generic paid ads without checking"],
  fundingEcosystem: [],
  advisoryNotes: [],
};

export function getRegionalContext(countryCode: string | null | undefined): RegionalContext {
  if (!countryCode) return GLOBAL_DEFAULT;
  return REGIONAL_CONTEXT[countryCode.toUpperCase()] ?? GLOBAL_DEFAULT;
}

/** Formats a regional context block for injection into AI prompts. */
export function formatRegionalContextBlock(countryCode: string | null | undefined): string {
  const ctx = getRegionalContext(countryCode);
  if (ctx === GLOBAL_DEFAULT && !countryCode) return "";

  const lines: string[] = [`REGIONAL CONTEXT — building in ${ctx.countryName}:`];
  if (ctx.paymentRails.length) lines.push(`Payment rails customers actually use: ${ctx.paymentRails.join(", ")}`);
  if (ctx.distributionChannels.length) lines.push(`Where this audience actually spends attention: ${ctx.distributionChannels.join(", ")}`);
  if (ctx.fundingEcosystem.length) lines.push(`Relevant funding/accelerator ecosystem: ${ctx.fundingEcosystem.join(", ")}`);
  for (const note of ctx.advisoryNotes) lines.push(`Note: ${note}`);
  lines.push("Prefer these specifics over generic Western defaults (e.g. don't default to 'run Facebook ads' or 'set up Stripe checkout' without checking regional fit first).");
  return lines.join("\n");
}
