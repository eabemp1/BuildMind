"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Cpu,
  Lightbulb,
  Radar,
  Rocket,
  Sparkles,
  Target,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensureUserProfile, getOnboardingStatus } from "@/lib/buildmind";
import DashboardPreview from "@/components/landing/dashboard-preview";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        await ensureUserProfile(data.user);
        const onboarded = await getOnboardingStatus(data.user.id);
        if (!onboarded) {
          router.replace("/onboarding");
          return;
        }
        router.replace("/dashboard");
      } catch {
        // keep landing page for anonymous users
      }
    };
    void check();
  }, [router]);

  return (
    <main className="relative min-h-screen overflow-hidden text-zinc-100">
      <div className="pointer-events-none absolute -left-40 top-20 h-80 w-80 rounded-full bg-indigo-500/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-10 h-96 w-96 rounded-full bg-purple-500/20 blur-[180px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-sky-500/15 blur-[200px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />

      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/30 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src="/brand/buildmind-logo-mascot.jpeg" width={140} height={40} alt="BuildMind" />
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/auth/login" className="text-zinc-300 transition hover:text-white">
              Login
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-28 pt-20 lg:flex-row lg:items-center lg:gap-16">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex-1">
          <Image src="/brand/buildmind-logo-landing-page.jpeg" width={180} height={48} alt="BuildMind" />
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
            Build Your Startup Step-by-Step With AI Guidance
          </h1>
          <p className="text-body mt-6 max-w-xl text-base md:text-lg">
            Plan your idea, validate it, generate an execution roadmap, and track milestones — all in one workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth/signup"
              className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 text-sm font-semibold text-white"
            >
              Start Building Your Startup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="#demo"
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-zinc-200"
            >
              See How It Works
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex-1"
        >
          <DashboardPreview variant="dashboard" />
        </motion.div>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="grid gap-6 md:grid-cols-2">
          <div className="glass-panel panel-glow p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">
              90% of startups fail because founders build without validation or clear execution plans.
            </p>
            <h2 className="mt-3 text-2xl font-semibold">Most Startup Ideas Never Get Executed.</h2>
            <p className="text-body mt-3">
              Founders stall when validation is unclear, roadmaps are missing, and the first steps are hard to prioritize.
            </p>
            <div className="mt-5 grid gap-3">
              {[
                { label: "No clear validation signals", icon: Radar },
                { label: "Roadmaps disappear after brainstorming", icon: Target },
                { label: "Execution starts too early", icon: Rocket },
                { label: "Progress is invisible", icon: BarChart3 },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                  <item.icon className="h-4 w-4 text-indigo-300" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-panel panel-glow p-6">
            <h2 className="text-2xl font-semibold">BuildMind Turns Ideas Into Action.</h2>
            <p className="text-body mt-3">AI validation, roadmap generation, and execution tracking in one product.</p>
            <div className="mt-5 grid gap-3">
              {[
                { title: "AI Startup Analysis", description: "Analyze your startup idea and identify strengths, risks, and validation gaps.", icon: Lightbulb },
                { title: "Execution Roadmap", description: "Generate structured milestones and tasks tailored to your startup.", icon: Sparkles },
                { title: "Milestone Tracking", description: "Track progress from idea → validation → MVP → launch.", icon: ClipboardCheck },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3 text-sm font-semibold text-zinc-100">
                    <item.icon className="h-4 w-4 text-indigo-300" />
                    {item.title}
                  </div>
                  <p className="text-body mt-2">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <section id="demo" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-white">See How BuildMind Works</h2>
          <p className="text-body mt-2 max-w-2xl">
            From idea capture to AI validation and roadmap execution in minutes.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "Step 1", body: "Enter your startup idea and target audience.", icon: Lightbulb },
            { title: "Step 2", body: "AI analyzes the idea with structured feedback.", icon: Sparkles },
            { title: "Step 3", body: "Receive a roadmap and execution plan.", icon: Rocket },
          ].map((step, idx) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.05 }}
              className="glass-panel panel-glow p-5"
            >
              <step.icon className="h-5 w-5 text-indigo-300" />
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-zinc-500">{step.title}</p>
              <h4 className="mt-2 text-lg font-semibold text-white">{step.body}</h4>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="product" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-white">Feature Highlights</h2>
          <p className="text-body mt-2 max-w-2xl">Three core capabilities that keep founders focused on execution.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "AI Startup Analysis", desc: "Analyze your startup idea and identify strengths, risks, and validation gaps.", icon: Lightbulb },
            { title: "Execution Roadmap", desc: "Generate structured milestones and tasks tailored to your startup.", icon: Rocket },
            { title: "Milestone Tracking", desc: "Track progress from idea → validation → MVP → launch.", icon: ClipboardCheck },
          ].map((feature) => (
            <motion.div
              key={feature.title}
              whileHover={{ y: -5, scale: 1.01 }}
              className="glass-panel panel-glow p-6"
            >
              <feature.icon className="h-5 w-5 text-indigo-300" />
              <h4 className="mt-3 text-lg font-semibold text-white">{feature.title}</h4>
              <p className="text-body mt-2">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-white">See BuildMind in Action</h2>
          <p className="text-body mt-2 max-w-2xl">A quick look at the workspace founders use to execute with clarity.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "Projects Dashboard", body: "Track active projects and execution progress.", component: <DashboardPreview variant="dashboard" /> },
            { title: "BuildMini Chat", body: "Get guidance from BuildMini in context.", component: <DashboardPreview variant="coach" /> },
            { title: "Milestone Tracker", body: "Visualize each stage of your roadmap.", component: <DashboardPreview variant="milestones" /> },
          ].map((item) => (
            <div key={item.title} className="glass-panel panel-glow overflow-hidden p-4">
              <div className="mb-3 text-sm font-semibold text-zinc-100">{item.title}</div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                {item.component}
              </div>
              <p className="text-body mt-3 text-sm">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-white">Built for founders and indie builders</h2>
          <p className="text-body mt-2 max-w-2xl">Early founders are using BuildMind to turn ideas into execution plans.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            "BuildMind helped me finally structure my startup roadmap.",
            "This feels like having a startup mentor built into my workspace.",
            "BuildMind gave me a clear execution path in days, not weeks.",
          ].map((quote) => (
            <div key={quote} className="glass-panel panel-glow p-6">
              <p className="text-sm text-zinc-300">“{quote}”</p>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-zinc-500">Early Founder</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="glass-panel panel-glow relative overflow-hidden p-10">
          <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-purple-500/20 blur-[120px]" />
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-3xl font-semibold text-white">Start Building Your Startup Today</h3>
              <p className="text-body mt-2">Create your first startup roadmap in under 2 minutes.</p>
            </div>
            <Link
              href="/auth/signup"
              className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 text-sm font-semibold text-white"
            >
              Start Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer id="privacy" className="border-t border-white/5 pb-10 pt-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 text-sm text-zinc-400 md:flex-row md:items-center md:justify-between">
          <span>© 2026 BuildMind</span>
          <div className="flex flex-wrap gap-4">
            <Link href="#product" className="hover:text-white">Product</Link>
            <Link href="#features" className="hover:text-white">Features</Link>
            <Link href="#pricing" className="hover:text-white">Pricing</Link>
            <Link href="#privacy" className="hover:text-white">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
