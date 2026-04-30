import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

export const metadata = { title: "Privacy Policy – BuildMind" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bm-bg bm-text" style={{ fontFamily: "system-ui,sans-serif" }}>
      <nav className="border-b border-[var(--bm-border)] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <BrandMark size={22} href="/" />
          <span className="text-sm font-medium bm-text">BuildMind</span>
          <span className="bm-text3 text-sm">/ Privacy Policy</span>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-12 prose prose-invert prose-sm">
        <h1 className="text-2xl font-semibold bm-text mb-2">Privacy Policy</h1>
        <p className="text-xs bm-text3 mb-8">Last updated: April 2025</p>

        <div className="space-y-8 text-sm bm-text2 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold bm-text mb-2">1. What we collect</h2>
            <p>When you create an account, we collect your email address and the password you choose (stored as a secure hash — we never see your plaintext password). When you use BuildMind, we store the startup information you enter, your daily actions, reflections, roadmap progress, and usage analytics (page views, feature clicks) to improve the product.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">2. How we use it</h2>
            <p>Your data is used to power BuildMind&apos;s core features — generating your daily action, weekly report, roadmap, and AI coaching. We use aggregated, anonymized analytics to understand how founders use the product. We do not sell your personal data to third parties.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">3. Third-party services</h2>
            <p>BuildMind uses Supabase (database and authentication), Anthropic Claude (AI generation), and Posthog (product analytics). Each of these providers has their own privacy policy. We share only the minimum data needed for each service to function.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">4. Data retention</h2>
            <p>Your account and all associated data are retained until you request deletion. To delete your account and all data, email us at <a href="mailto:hello@buildmind.live" className="text-indigo-400 hover:text-indigo-300">hello@buildmind.live</a>. We will process the deletion within 7 business days.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">5. Cookies</h2>
            <p>We use session cookies for authentication. We do not use advertising or tracking cookies. Our analytics provider (Posthog) may set cookies to track usage across sessions.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">6. Security</h2>
            <p>All data is transmitted over HTTPS. Passwords are hashed using industry-standard algorithms. We use Supabase row-level security policies to ensure each user can only access their own data.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">7. Contact</h2>
            <p>Questions about this policy? Email <a href="mailto:hello@buildmind.live" className="text-indigo-400 hover:text-indigo-300">hello@buildmind.live</a>.</p>
          </section>
        </div>

        <div className="mt-10 border-t border-[var(--bm-border)] pt-6 text-xs bm-text3">
          <Link href="/" className="hover:text-zinc-300">← Back to BuildMind</Link>
          <span className="mx-3">·</span>
          <Link href="/legal/terms" className="hover:text-zinc-300">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}
