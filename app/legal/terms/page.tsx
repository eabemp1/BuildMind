import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";

export const metadata = { title: "Terms of Service – BuildMind" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bm-bg bm-text" style={{ fontFamily: "system-ui,sans-serif" }}>
      <nav className="border-b border-[var(--bm-border)] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <BrandMark size={22} href="/" />
          <span className="text-sm font-medium bm-text">BuildMind</span>
          <span className="bm-text3 text-sm">/ Terms of Service</span>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold bm-text mb-2">Terms of Service</h1>
        <p className="text-xs bm-text3 mb-8">Last updated: April 2025</p>

        <div className="space-y-8 text-sm bm-text2 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold bm-text mb-2">1. Acceptance</h2>
            <p>By creating a BuildMind account or using BuildMind in any way, you agree to these Terms of Service. If you do not agree, do not use BuildMind.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">2. What BuildMind is</h2>
            <p>BuildMind is a daily execution tool for solo founders. It uses AI to generate personalized daily actions, roadmaps, and weekly reports based on the information you provide. The AI outputs are suggestions — you are responsible for your own business decisions.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">3. Your account</h2>
            <p>You are responsible for keeping your account credentials secure. You must be at least 13 years old to use BuildMind. You may not use BuildMind for any illegal purpose or in violation of anyone&apos;s rights.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">4. Subscriptions and billing</h2>
            <p>The Builder plan is a recurring monthly subscription. You can cancel at any time from your account settings. Cancellation takes effect at the end of the current billing period — you retain access until then. We do not offer refunds for partial months.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">5. Intellectual property</h2>
            <p>The content you enter into BuildMind (your startup idea, actions, reflections) remains yours. The BuildMind platform, code, brand, and AI-generated framework are owned by BuildMind. You may not copy or redistribute the BuildMind platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">6. Disclaimer of warranties</h2>
            <p>BuildMind is provided &quot;as is&quot; without warranties of any kind. We do not guarantee that AI-generated advice will be accurate, complete, or suitable for your specific situation. BuildMind is a productivity tool, not a licensed business advisor.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">7. Limitation of liability</h2>
            <p>To the maximum extent permitted by law, BuildMind&apos;s liability for any claim related to the service is limited to the amount you paid us in the 3 months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">8. Changes to these terms</h2>
            <p>We may update these terms. When we do, we&apos;ll update the date at the top of this page and notify you by email if the changes are material. Continued use of BuildMind after changes means you accept the new terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold bm-text mb-2">9. Contact</h2>
            <p>Questions? Email <a href="mailto:hello@buildmind.live" className="text-indigo-400 hover:text-indigo-300">hello@buildmind.live</a>.</p>
          </section>
        </div>

        <div className="mt-10 border-t border-[var(--bm-border)] pt-6 text-xs bm-text3">
          <Link href="/" className="hover:text-zinc-300">← Back to BuildMind</Link>
          <span className="mx-3">·</span>
          <Link href="/legal/privacy" className="hover:text-zinc-300">Privacy Policy</Link>
        </div>
      </main>
    </div>
  );
}
