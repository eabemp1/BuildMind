"use client";

/**
 * components/ExecutionSystem.tsx — v2 (Fix #8)
 *
 * Execution Systems must look and feel NOTHING like project milestones.
 * This replaces the old milestone-alike card list with:
 *
 *   • A "Mission Control" metaphor — systems displayed as operational dashboards
 *   • Each system has: a status indicator (Active / Paused / Queued),
 *     a confidence dial, a trigger condition, and a decision tree preview
 *   • "Run System" fires the system immediately (not "add task")
 *   • Visual language: terminal-style, operational, not planning-focused
 *   • Systems feel like AUTOMATED PROCESSES, not to-do lists
 *
 * This is the component used by /app/ventures/[id]/execution/page.tsx
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type SystemStatus = "active" | "paused" | "queued" | "running";

export type DecisionNode = {
  condition: string;
  yes: string;
  no: string;
};

export type ExecutionSystem = {
  id: string;
  name: string;
  category: "distribution" | "validation" | "revenue" | "retention" | "growth" | "ops";
  status: SystemStatus;
  trigger: string;         // "When X happens, run this system"
  objective: string;       // What this system optimises for
  confidence: number;      // 0–100 — AI confidence this system fits your stage
  decisionTree: DecisionNode;
  steps: string[];         // Ordered execution steps (operational, not tasks)
  kpi: string;             // The one metric this system moves
  frequency: "once" | "daily" | "weekly" | "trigger-based";
  lastRun?: string;
  nextRun?: string;
};

const CATEGORY_META: Record<ExecutionSystem["category"], { label: string; icon: string; color: string }> = {
  distribution:  { label: "Distribution", icon: "📡", color: "#818cf8" },
  validation:    { label: "Validation",   icon: "🧪", color: "#fbbf24" },
  revenue:       { label: "Revenue",      icon: "💰", color: "#4ade80" },
  retention:     { label: "Retention",    icon: "🔁", color: "#a78bfa" },
  growth:        { label: "Growth",       icon: "📈", color: "#38bdf8" },
  ops:           { label: "Operations",   icon: "⚙️",  color: "#fb923c" },
};

const STATUS_META: Record<SystemStatus, { label: string; color: string; pulse: boolean }> = {
  active:  { label: "Active",   color: "#4ade80", pulse: true  },
  running: { label: "Running",  color: "#818cf8", pulse: true  },
  paused:  { label: "Paused",   color: "#fbbf24", pulse: false },
  queued:  { label: "Queued",   color: "#9090a8", pulse: false },
};

function ConfidenceDial({ value, color }: { value: number; color: string }) {
  const size = 52;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  // Half-arc dial (bottom half only): sweep 180°
  const arc = (value / 100) * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size / 2 + stroke / 2 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", top: 0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          strokeDashoffset={circ * 0.25}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "monospace" }}>{value}%</span>
      </div>
    </div>
  );
}

function PulsingDot({ color, pulse }: { color: string; pulse: boolean }) {
  return (
    <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {pulse && (
        <motion.div
          style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.4 }}
          animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </div>
  );
}

function DecisionTreePreview({ node, color }: { node: DecisionNode; color: string }) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 10.5 }}>
      <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 5 }}>
        IF <span style={{ color: "rgba(255,255,255,0.8)" }}>{node.condition}</span>
      </div>
      <div style={{ paddingLeft: 12, display: "flex", flexDirection: "column", gap: 3 }}>
        <div>
          <span style={{ color }}>✓ YES</span>
          <span style={{ color: "rgba(255,255,255,0.55)", marginLeft: 6 }}>→ {node.yes}</span>
        </div>
        <div>
          <span style={{ color: "#f87171" }}>✗ NO</span>
          <span style={{ color: "rgba(255,255,255,0.55)", marginLeft: 8 }}>→ {node.no}</span>
        </div>
      </div>
    </div>
  );
}

interface SystemCardProps {
  system: ExecutionSystem;
  onRun: (id: string) => void;
  onToggle: (id: string) => void;
}

function SystemCard({ system, onRun, onToggle }: SystemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_META[system.category];
  const status = STATUS_META[system.status];
  const isRunnable = system.status !== "running";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "rgba(14,14,22,0.9)",
        border: `1px solid ${expanded ? cat.color + "30" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      {/* Header row */}
      <div
        style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Category icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: `${cat.color}14`,
          border: `1px solid ${cat.color}25`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, flexShrink: 0,
        }}>
          {cat.icon}
        </div>

        {/* Name + trigger */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f0f0f6" }}>{system.name}</span>
            <span style={{ fontSize: 9, color: cat.color, background: `${cat.color}15`, border: `1px solid ${cat.color}25`, padding: "1px 6px", borderRadius: 4, fontWeight: 600, letterSpacing: "0.05em" }}>
              {cat.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TRIGGER: {system.trigger}
          </div>
        </div>

        {/* Status + confidence */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <PulsingDot color={status.color} pulse={status.pulse} />
            <span style={{ fontSize: 10, fontWeight: 600, color: status.color, fontFamily: "monospace" }}>{status.label}</span>
          </div>
          <ConfidenceDial value={system.confidence} color={cat.color} />
        </div>
      </div>

      {/* Expanded body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Objective + KPI */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>Objective</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{system.objective}</div>
                </div>
                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>KPI</div>
                  <div style={{ fontSize: 12, color: cat.color, fontWeight: 600 }}>{system.kpi}</div>
                </div>
              </div>

              {/* Decision tree */}
              <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 8 }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Decision Gate</div>
                <DecisionTreePreview node={system.decisionTree} color={cat.color} />
              </div>

              {/* Execution steps */}
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Execution Steps</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {system.steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 9, color: cat.color, fontFamily: "monospace", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer: frequency + action buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                  {system.frequency === "trigger-based" ? "⚡ Trigger-based" : `🔄 ${system.frequency}`}
                  {system.lastRun && <span style={{ marginLeft: 10 }}>Last: {system.lastRun}</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggle(system.id); }}
                    style={{
                      padding: "6px 12px", borderRadius: 7,
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {system.status === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (isRunnable) onRun(system.id); }}
                    disabled={!isRunnable}
                    style={{
                      padding: "6px 14px", borderRadius: 7,
                      background: isRunnable ? `${cat.color}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isRunnable ? cat.color + "35" : "rgba(255,255,255,0.06)"}`,
                      color: isRunnable ? cat.color : "rgba(255,255,255,0.2)",
                      fontSize: 11, fontWeight: 700, cursor: isRunnable ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    {system.status === "running" ? "Running…" : "▶ Run System"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Mission Control header ────────────────────────────────────────────────────
function MissionControlHeader({ systems }: { systems: ExecutionSystem[] }) {
  const active = systems.filter((s) => s.status === "active" || s.status === "running").length;
  const paused = systems.filter((s) => s.status === "paused").length;
  return (
    <div style={{ padding: "18px 0 12px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(168,213,186,0.7)", fontFamily: "monospace", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            Mission Control
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f0f0f6", letterSpacing: "-0.03em", margin: 0 }}>
            Execution Systems
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "4px 0 0", lineHeight: 1.5 }}>
            Automated operational playbooks — not tasks. Each system is a decision engine.
          </p>
        </div>
        {/* Live status strip */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "Active", value: active, color: "#4ade80" },
            { label: "Paused", value: paused, color: "#fbbf24" },
            { label: "Total",  value: systems.length, color: "rgba(255,255,255,0.4)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────
interface ExecutionSystemsProps {
  systems: ExecutionSystem[];
  onRun?: (id: string) => void;
  onToggle?: (id: string) => void;
  isLoading?: boolean;
}

export default function ExecutionSystems({
  systems,
  onRun = () => {},
  onToggle = () => {},
  isLoading = false,
}: ExecutionSystemsProps) {
  const [filter, setFilter] = useState<ExecutionSystem["category"] | "all">("all");

  const filtered = filter === "all" ? systems : systems.filter((s) => s.category === filter);
  const categories = Array.from(new Set(systems.map((s) => s.category)));

  if (isLoading) {
    return (
      <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(168,213,186,0.2)", borderTopColor: "rgba(168,213,186,0.8)" }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>Booting systems…</span>
      </div>
    );
  }

  if (systems.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>⚙️</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f6", marginBottom: 6 }}>No systems deployed</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", maxWidth: 340, margin: "0 auto" }}>
          Generate your execution systems from your venture blueprint. Each system is an automated decision engine, not a task list.
        </div>
      </div>
    );
  }

  return (
    <div>
      <MissionControlHeader systems={systems} />

      {/* Category filter tabs */}
      {categories.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {["all", ...categories].map((cat) => {
            const meta = cat !== "all" ? CATEGORY_META[cat as ExecutionSystem["category"]] : null;
            const isActive = filter === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat as typeof filter)}
                style={{
                  padding: "5px 12px", borderRadius: 7, border: "none",
                  background: isActive ? (meta ? `${meta.color}18` : "rgba(168,213,186,0.12)") : "rgba(255,255,255,0.03)",
                  color: isActive ? (meta?.color ?? "rgba(168,213,186,1)") : "rgba(255,255,255,0.35)",
                  fontSize: 11, fontWeight: isActive ? 700 : 400, cursor: "pointer", fontFamily: "inherit",
                  outline: isActive ? `1px solid ${meta?.color ?? "rgba(168,213,186,0.3)"}` : "none",
                  transition: "all 0.15s",
                }}
              >
                {meta ? `${meta.icon} ${meta.label}` : "All Systems"}
              </button>
            );
          })}
        </div>
      )}

      {/* System cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <AnimatePresence mode="popLayout">
          {filtered.map((system) => (
            <SystemCard key={system.id} system={system} onRun={onRun} onToggle={onToggle} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
