// lib/ventures.ts — Complete venture track data (UPDATED: ConsentLedger added)

export type MilestoneType = "action" | "research" | "legal" | "money" | "security";

export interface VentureMilestone {
  id: string;
  week: string;
  task: string;
  type: MilestoneType;
  detail: string;
  enforcement: string;
  papers?: string[];
}

export interface VenturePhase {
  id: string;
  label: string;
  weeks: string;
  goal: string;
  color: string;
  milestones: VentureMilestone[];
}

export interface VentureTrack {
  id: string;
  name: string;
  tag: string;
  month: string;
  status: "active" | "upcoming" | "locked";
  dayN: number;
  totalDays: number;
  color: string;
  tagline: string;
  soloFirstNote: string;
  stats: { label: string; value: string }[];
  revenueModel: { label: string; value: string }[];
  phases: VenturePhase[];
  consentLedgerCTA?: boolean; // marks ventures that should show CL upsell
}

export const VENTURE_TRACKS: VentureTrack[] = [

  // ─── ConsentLedger ─────────────────────────────────────────────────────────
  {
    id: "consentledger",
    name: "ConsentLedger",
    tag: "Legal Tech · GDPR · Europe",
    month: "Month 1–3",
    status: "active",
    dayN: 1,
    totalDays: 90,
    color: "#7F77DD",
    tagline: "GDPR consent management for small EU businesses — built from Ghana",
    soloFirstNote: "No partnership, no EU residency, no lawyer needed to start. Build the free GDPR checker tool first — it generates leads without ads. Every small EU business owner who sees red flags on their site is a potential paying customer. You close them by making their problem visible, then solving it in 2 minutes.",
    stats: [
      { label: "EU businesses at risk", value: "2.4M+" },
      { label: "Max GDPR fine", value: "€20M" },
      { label: "Your price", value: "$9–29/mo" },
    ],
    revenueModel: [
      { label: "Starter plan", value: "$9/mo — 1 domain, basic audit log" },
      { label: "Growth plan", value: "$19/mo — 3 domains, API access" },
      { label: "Agency plan", value: "$49/mo — unlimited domains" },
      { label: "Month 3 target", value: "$300 MRR (15 paying customers)" },
      { label: "Month 6 target", value: "$2,000 MRR (100 customers)" },
      { label: "Month 12 target", value: "$10,000 MRR (500 customers)" },
    ],
    phases: [
      {
        id: "build",
        label: "Build",
        weeks: "Week 1–3",
        goal: "Ship the free GDPR checker tool before writing any paid code",
        color: "#7F77DD",
        milestones: [
          {
            id: "cl1", week: "Day 1–3", type: "research",
            task: "Research 10 EU GDPR enforcement cases from 2023–2024",
            detail: "Go to gdprhub.eu and enforcementtracker.com. Find 10 real fines issued to small businesses (under 50 employees). Note: the violation, the amount, the company size, the country. This becomes your fear-inducing copy on the GDPR checker results page. Real fines make the problem viscerally real.",
            enforcement: "Paste 10 cases with fine amounts into your BuildMind project log by Day 3. Must be real cases with source links.",
            papers: ["GDPR Enforcement Tracker 2024 — CMS Law", "ICO Annual Report 2023 — UK", "EDPB Guidelines on Consent 2023"],
          },
          {
            id: "cl2", week: "Day 3–7", type: "action",
            task: "Build the free GDPR checker page — URL input → 5 checks → scary results",
            detail: "Build a standalone Next.js page at /gdpr-check. It takes a URL and runs 5 checks: (1) No consent banner detected, (2) Google Analytics / Meta Pixel loading before consent, (3) No privacy policy page found, (4) Third-party cookies loading without permission, (5) No cookie policy. Use a headless browser (Playwright or Puppeteer) to crawl the URL server-side. Each failed check shows the potential fine amount. CTA at the bottom: 'Fix all of this in 5 minutes with ConsentLedger — free to start.'",
            enforcement: "GDPR checker must be live and returning real results on at least 3 test URLs before moving to the SDK milestone. Deploy it to a standalone domain (gdprcheck.io or similar).",
            papers: ["GDPR Article 7 — Conditions for Consent", "ePrivacy Directive Article 5(3) — Cookie Rules"],
          },
          {
            id: "cl3", week: "Week 2", type: "action",
            task: "Write the JavaScript SDK — @consentledger/js npm package",
            detail: "npm package with 3 methods: ConsentLedger.init({ apiKey, purposes, lang }), ConsentLedger.hasConsent('analytics'), ConsentLedger.withdraw(userId). The SDK: (1) Loads a configurable consent banner on page load, (2) Sends consent events to your API with timestamp + user fingerprint + IP country, (3) Stores consent in localStorage and syncs to server, (4) Blocks third-party scripts until consent granted. Written in TypeScript, 0 dependencies, under 8KB gzipped.",
            enforcement: "SDK installable via npm install @consentledger/js. Passing a 5-step test: init loads, banner appears, consent recorded, hasConsent returns true, withdraw deletes record. Upload test screenshot.",
          },
          {
            id: "cl4", week: "Week 2–3", type: "security",
            task: "Build the consent record API — 4 endpoints on Railway",
            detail: "POST /v1/consent — record a consent event (userId, purposes, timestamp, ipCountry, sdkVersion). GET /v1/consent?userId=X — retrieve audit log for a user. DELETE /v1/consent — record a withdrawal. GET /v1/consent/export — return PDF audit log for regulators. Store in PostgreSQL on Railway EU region (Frankfurt). All records are immutable — consent withdrawals ADD a withdrawal record, they don't delete the original. This is the legal paper trail.",
            enforcement: "All 4 endpoints returning correct responses in Postman. Must be deployed to EU region before any customer goes live.",
            papers: ["GDPR Article 5 — Data Integrity", "GDPR Article 17 — Right to Erasure vs Audit Requirements"],
          },
          {
            id: "cl5", week: "Week 3", type: "action",
            task: "Build the customer dashboard — consent records + compliance score",
            detail: "Reskin the existing BuildMind Next.js frontend. Keep: auth, Supabase, sidebar layout, plan chip. Replace: project/task views with — (1) Compliance score (0–100), (2) Total consent records this month, (3) Opt-in rate %, (4) Audit log table (user, date, purposes, withdraw status), (5) SDK installation code snippet with API key, (6) Banner customization (position, color, language). Keep it simple — the entire dashboard should be understandable by a non-technical EU shop owner.",
            enforcement: "A non-technical person (friend or family member) must be able to understand the dashboard without explanation. Get one person to try it and report what confused them.",
          },
        ],
      },
      {
        id: "launch",
        label: "Launch",
        weeks: "Week 4–6",
        goal: "First 5 paying customers before you write a single marketing word",
        color: "#534AB7",
        milestones: [
          {
            id: "cl6", week: "Week 4", type: "legal",
            task: "Set up Lemon Squeezy billing + EU VAT handling",
            detail: "Create account at lemonsqueezy.com. Create 3 products: Starter ($9), Growth ($19), Agency ($49). Enable tax collection — Lemon Squeezy handles EU VAT for you automatically. Connect Wise Business account to receive payouts. Set up the webhook: on order_created, update Supabase users.plan field. Test with a real $1 transaction to yourself.",
            enforcement: "Live checkout link working. Test purchase processed. Webhook updating the database. Payout confirmed in Wise account.",
            papers: ["Lemon Squeezy EU VAT Guide", "Wise Business Account for Ghana — Setup Guide"],
          },
          {
            id: "cl7", week: "Week 4–5", type: "action",
            task: "Cold email 50 small EU e-commerce shop owners",
            detail: "Find them on: Shopify store directories, WooCommerce showcases, Etsy shop owners (EU filter), Instagram small business hashtags (#uksmallbusiness #germanshop). Template: 'Hi [name] — I ran a quick GDPR check on [their domain] and found 2 issues that could result in a fine: [paste the 2 specific issues from your checker]. I built a tool that fixes both in 5 minutes, free to start. Want me to send you the link?' Personalize the specific issues for each domain using your own checker tool.",
            enforcement: "50 emails sent, replies tracked in a simple spreadsheet. Upload the email log with response rates by end of Week 5.",
          },
          {
            id: "cl8", week: "Week 5", type: "money",
            task: "Convert first 5 free users to paid — offer 3 months at 50% off",
            detail: "Identify the 5 most engaged free users (most consent records, logged in multiple times). Send them a personal message: 'You've recorded [X] consents this month — that's real legal protection. I'm offering the first 5 customers 3 months at 50% off as a founding member deal: $4.50/mo instead of $9. That's your entire annual GDPR risk management for $54.' The 50% discount costs you $22.50 but locks in your first social proof and testimonials.",
            enforcement: "5 paying customers active in Lemon Squeezy. Screenshot of 5 active subscriptions uploaded.",
          },
          {
            id: "cl9", week: "Week 6", type: "action",
            task: "Post your GDPR checker on 5 EU founder communities",
            detail: "Post in: (1) r/ecommerce — 'I built a free GDPR checker — paste your URL and see your risks', (2) Indie Hackers — 'Show IH: Free GDPR compliance checker — found 847 violations on first 100 URLs tested', (3) Product Hunt — submit as a free tool, (4) EU-focused Facebook groups for small business owners, (5) LinkedIn with a specific data point: 'Tested 50 EU shop sites — 73% had Google Analytics loading before consent. That's a €20M fine risk.' The tool is the ad.",
            enforcement: "Links to all 5 posts submitted to project log. Track click-throughs to the checker from each source.",
          },
        ],
      },
      {
        id: "scale",
        label: "Scale",
        weeks: "Week 7–12",
        goal: "$300 MRR → $2,000 MRR. Automate, then grow.",
        color: "#3C3489",
        milestones: [
          {
            id: "cl10", week: "Week 7–8", type: "action",
            task: "Build a Shopify app listing for the ConsentLedger plugin",
            detail: "Shopify has 1.7M stores, most EU-based stores need GDPR compliance. Build a Shopify app that auto-detects the store's cookie setup, installs the ConsentLedger banner in 1 click, and syncs consent records. List in the Shopify App Store under 'GDPR & Privacy'. Free tier, upsell to paid inside the app. This is your distribution channel — Shopify brings the traffic.",
            enforcement: "Shopify app submitted for review. Working on a test store with real consent recording.",
            papers: ["Shopify App Store Guidelines 2024", "GDPR for Shopify Merchants — Shopify Help Center"],
          },
          {
            id: "cl11", week: "Week 8–10", type: "money",
            task: "Launch a referral program — $5 credit per referred paying customer",
            detail: "Add a referral section to the dashboard: 'Give a friend $5 off, get $5 credit when they upgrade.' Agency plan customers refer their own clients — this is your agency reseller channel. One agency customer with 10 clients = $490/mo from a single referral source.",
            enforcement: "Referral system live. First 3 referred sign-ups tracked.",
          },
          {
            id: "cl12", week: "Week 10–12", type: "action",
            task: "Write one SEO article per week: 'GDPR for [country] small businesses'",
            detail: "Target: 'GDPR for UK Shopify stores', 'GDPR compliance Germany small business', 'Cookie consent France e-commerce'. These rank for high-intent searches. Structure: what the law requires, what the fine risks are, how to fix it in 5 minutes with a tool. Embed your GDPR checker in each article. 10 articles = 500 organic visitors/month = 5–10 new sign-ups/month at zero cost.",
            enforcement: "4 articles published on your site, indexed in Google Search Console. Submit URLs.",
          },
        ],
      },
    ],
  },

  // ─── SafeRemit ─────────────────────────────────────────────────────────────
  {
    id: "saferemit",
    name: "SafeRemit",
    tag: "Fintech · Africa · Global",
    month: "Month 4–6",
    status: "upcoming",
    dayN: 0,
    totalDays: 90,
    color: "#5dd4c8",
    tagline: "Fraud-proof cross-border payments for migrant workers",
    soloFirstNote: "No license, no bank partnership, no funding needed to start. Do 20 interviews this week. Build the demo in Week 4. Run 5 real transactions in Week 6. You earn partnerships by showing up with users and data — not a pitch deck.",
    stats: [
      { label: "Annual remittances", value: "$800B" },
      { label: "Lost to fees & fraud", value: "8–12%" },
      { label: "Your take rate", value: "2%" },
    ],
    revenueModel: [
      { label: "Sender fee (2%)", value: "On every transfer" },
      { label: "FX spread (0.5%)", value: "On exchange rate" },
      { label: "Agent commission cut", value: "You keep 1.5%, agent gets 0.5%" },
      { label: "Month 3 target", value: "$200 MRR (100 transactions)" },
      { label: "Year 1 target", value: "$2,000/mo MRR" },
      { label: "Year 2 raise", value: "$500K pre-seed on $2M GMV" },
    ],
    phases: [
      {
        id: "discovery",
        label: "Discovery",
        weeks: "Week 1–2",
        goal: "Prove the pain is real before writing code",
        color: "#6366f1",
        milestones: [
          {
            id: "sr1", week: "Day 1–3", type: "action",
            task: "20 migrant worker interviews in Accra",
            detail: "Go to Accra Central market, Tema port, Suame Magazine. Ask: How do you send money home? What goes wrong? How much do you lose in fees? What would make you trust a new service? Record on phone with permission. Don't pitch — just listen and take notes.",
            enforcement: "Upload 3 interview summaries (bullet points, not transcripts) to your BuildMind project log by Day 3. No summaries = this action is marked incomplete.",
            papers: ["Remittance Costs and Macroeconomic Outcomes — World Bank 2022", "Migrant Workers and Financial Exclusion — IFC 2023", "GSMA Mobile Money Remittance Report 2024"],
          },
          {
            id: "sr2", week: "Day 3–5", type: "research",
            task: "Map the full Ghana ↔ UK remittance corridor",
            detail: "Document every step from sender to receiver. Test Western Union, WorldRemit, Wave, Sendwave yourself with $5 each. Record: fees at each step, time delays, failure modes, fraud vectors, customer support quality.",
            enforcement: "Submit a corridor map diagram + fee comparison table covering at least 4 services. Must include actual tested data, not estimates.",
            papers: ["Bank of Ghana Foreign Exchange Guidelines 2023", "FCA Consumer Remittance Review UK 2024"],
          },
          {
            id: "sr3", week: "Day 5–7", type: "legal",
            task: "First regulatory scan — know the licensing path before you build",
            detail: "Ghana: Bank of Ghana PSP license (GHS 500K min capital, 3–6 months). UK: FCA EMI license (£350K min capital, 12–18 months). You don't need them yet — but you need to know the cost, timeline, and what you can do in test mode legally.",
            enforcement: "Write a 1-page regulatory roadmap with cost estimates and timeline for each jurisdiction.",
            papers: ["Bank of Ghana PSP Licensing Framework 2021", "FCA EMI Authorization Guide UK 2024"],
          },
        ],
      },
    ],
    consentLedgerCTA: true,
  },

  // ─── MediChain ─────────────────────────────────────────────────────────────
  {
    id: "medichain",
    name: "MediChain",
    tag: "Health Tech · Ghana · Global",
    month: "Month 7–9",
    status: "locked",
    dayN: 0,
    totalDays: 90,
    color: "#a080f0",
    tagline: "Portable encrypted health records for 3.8B unlinked people",
    soloFirstNote: "Build a free Personal Health Passport QR generator first — no hospital partnership needed. Anyone enters their blood type, allergies, medications, emergency contact and gets an encrypted QR card. Get 500 users, then walk into clinics with proof. The institution comes to you when you have the users.",
    stats: [
      { label: "Unlinked patients globally", value: "3.8B" },
      { label: "Health IT market", value: "$58B" },
      { label: "Partnerships needed to start", value: "0" },
    ],
    revenueModel: [
      { label: "Clinic SaaS subscription", value: "GHS 500/mo (~$35)" },
      { label: "Individual premium plan", value: "$3/mo" },
      { label: "NHIA API access for insurers", value: "Per-query pricing" },
      { label: "Month 3 target", value: "10 clinics = $350 MRR" },
    ],
    phases: [],
    consentLedgerCTA: true,
  },

  // ─── SkillLedger ─────────────────────────────────────────────────────────
  {
    id: "skillledger",
    name: "SkillLedger",
    tag: "EdTech · HR Tech · Global",
    month: "Month 10–11",
    status: "locked",
    dayN: 0,
    totalDays: 60,
    color: "#e0b84a",
    tagline: "Verifiable skill credentials for the degreeless workforce",
    soloFirstNote: "Build 3 free proctored skill tests first. Anyone can take them — no employer needed. Issue W3C cryptographically-signed badges. Get 200 badge holders, then email employers: 'Your next hire might have a SkillLedger badge. Verify in 10 seconds, free.'",
    stats: [
      { label: "Degreeless workers", value: "1.2B" },
      { label: "Per credential", value: "$5–20" },
      { label: "Employer subscription", value: "$99/mo" },
    ],
    revenueModel: [
      { label: "Credential issuance fee", value: "$5–20 per badge" },
      { label: "Employer hiring API", value: "$99–299/mo per company" },
      { label: "Training partner revenue share", value: "15% on completions" },
      { label: "Month 2 target", value: "$990 MRR (10 employer accounts)" },
    ],
    phases: [],
    consentLedgerCTA: true,
  },

  // ─── EldercareOS ─────────────────────────────────────────────────────────
  {
    id: "eldercareos",
    name: "EldercareOS",
    tag: "Care Tech · Diaspora · Ghana",
    month: "Month 12+",
    status: "locked",
    dayN: 0,
    totalDays: 60,
    color: "#5dd4c8",
    tagline: "Family-coordinated care for aging parents in diaspora communities",
    soloFirstNote: "Build the free family dashboard first — medication tracking, SMS reminders via Twilio, shared family access. No caregiver marketplace needed yet. Get 50 families using it (UK-Ghana diaspora is your beachhead). Then recruit 10 background-checked caregivers in Accra with police clearance.",
    stats: [
      { label: "Diaspora globally", value: "400M+" },
      { label: "Family subscription", value: "$19/mo" },
      { label: "Caregiver booking cut", value: "20%" },
    ],
    revenueModel: [
      { label: "Family subscription (premium)", value: "$19/mo" },
      { label: "Caregiver booking commission", value: "20% per visit" },
      { label: "Hospital referral program", value: "GHS 50 per family referred" },
      { label: "Month 2 target", value: "$2,250 MRR (100 families + 50 bookings)" },
    ],
    phases: [],
    consentLedgerCTA: true,
  },
];

export const VENTURE_TIMELINE = [
  { month: "Month 1–3", name: "ConsentLedger", focus: "GDPR checker live → SDK built → 5 paying customers → $300 MRR → Shopify app", color: "#7F77DD" },
  { month: "Month 4–6", name: "SafeRemit", focus: "20 interviews → 5 real transactions → 100 tx/mo → BoG application → accelerator pitch", color: "#5dd4c8" },
  { month: "Month 7–9", name: "MediChain", focus: "500 health passports → 1st clinic → 10 clinics → NHIA research → Ghana grant application", color: "#a080f0" },
  { month: "Month 10–11", name: "SkillLedger", focus: "3 skill tests → 200 free badges → $5/credential → 10 employer accounts → $990 MRR", color: "#e0b84a" },
  { month: "Month 12+", name: "EldercareOS", focus: "50 families → 10 caregivers → 1st bookings → $19/mo subscription → hospital referral program", color: "#5dd4c8" },
];

export const COMBINED_REVENUE = [
  { month: "Month 3",  consentledger: "$300",  saferemit: "$0",    medichain: "$0",    skillledger: "$0",   eldercareos: "$0",    total: "$300" },
  { month: "Month 6",  consentledger: "$1,200", saferemit: "$200",  medichain: "$0",    skillledger: "$0",   eldercareos: "$0",    total: "$1,400" },
  { month: "Month 9",  consentledger: "$3,000", saferemit: "$600",  medichain: "$350",  skillledger: "$0",   eldercareos: "$0",    total: "$3,950" },
  { month: "Month 12", consentledger: "$5,000", saferemit: "$1,200", medichain: "$700",  skillledger: "$990", eldercareos: "$500",  total: "$8,390" },
];
