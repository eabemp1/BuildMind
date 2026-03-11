"use client";

import { motion } from "framer-motion";
import { Activity, CheckCircle2, Cpu, Layers, Sparkles } from "lucide-react";
import ProgressBar from "@/components/progress-bar";

export default function DashboardPreview() {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      className="relative"
    >
      <div className="pointer-events-none absolute -inset-6 rounded-[32px] bg-gradient-to-r from-indigo-500/30 via-purple-500/20 to-sky-500/20 blur-3xl" />
      <div className="glass-panel panel-glow relative rounded-[28px] border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">BuildMind</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Execution Dashboard</h3>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">Live</span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            { label: "Active Projects", value: "12", icon: Layers },
            { label: "Tasks Completed", value: "86%", icon: CheckCircle2 },
            { label: "AI Usage", value: "16/20", icon: Cpu },
            { label: "Momentum", value: "On Track", icon: Activity },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{card.label}</span>
                  <Icon className="h-4 w-4 text-indigo-300" />
                </div>
                <p className="mt-3 text-xl font-semibold text-white">{card.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Roadmap Progress</span>
              <span className="text-emerald-300">72%</span>
            </div>
            <div className="mt-3 space-y-3">
              <ProgressBar value={72} />
              <div className="grid gap-2 text-xs text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>Validation</span>
                  <span className="text-zinc-200">Complete</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>MVP Build</span>
                  <span className="text-zinc-200">In Progress</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Launch</span>
                  <span className="text-zinc-500">Upcoming</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>BuildMini</span>
              <Sparkles className="h-4 w-4 text-purple-300" />
            </div>
            <p className="mt-3 text-sm text-zinc-200">
              “Interview 5 potential users before expanding feature scope.”
            </p>
            <div className="mt-4 space-y-2 text-xs text-zinc-400">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Validation complete
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                Next up: MVP sprint
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
