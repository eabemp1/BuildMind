"use client";
/**
 * app/memory/page.tsx
 * "What BuildMind knows about you" — surfaces the founder memory model
 * so founders can see the system actually learning about them.
 * Increases retention: founders who see this stay.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

interface FounderMemory {
  avoidance_zones: string[];
  strengths: string[];
  personality_tags: string[];
  last_insight: string | null;
  archetype_classified_at: string | null;
}

interface FounderCtx {
  current_stage: string | null;
  momentum_score: number | null;
  streak: number | null;
  days_inactive: number;
  override_reasons: string[];
  topics_mentioned_repeatedly: string[];
  cognitive_load: string | null;
  consecutive_tasks_completed: number;
  tasks_completed_total: number;
}

const TAG_COLORS = [
  "rgba(232,197,71,0.15)",
  "rgba(74,184,176,0.12)",
  "rgba(155,127,232,0.14)",
  "rgba(232,160,32,0.12)",
];
const TAG_BORDERS = [
  "rgba(232,197,71,0.4)",
  "rgba(74,184,176,0.3)",
  "rgba(155,127,232,0.3)",
  "rgba(232,160,32,0.3)",
];
const TAG_TEXT = [
  "var(--bm-accent)",
  "var(--bm-teal, #4AB8B0)",
  "#9B7FE8",
  "var(--bm-amber)",
];

function Tag({ label, index }: { label: string; index: number }) {
  const i = index % 4;
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 99,
      background: TAG_COLORS[i],
      border: `1px solid ${TAG_BORDERS[i]}`,
      color: TAG_TEXT[i],
      fontSize: 12,
      fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 14,
        border: "1px solid var(--bm-border)",
        background: "var(--bm-bg2)",
        padding: "20px 22px",
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <span>{icon}</span>{title}
      </div>
      {children}
    </motion.div>
  );
}

function EmptySlot({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 12, color: "var(--bm-text4)", fontStyle: "italic" }}>
      {label}
    </span>
  );
}

export default function MemoryPage() {
  const [memory, setMemory] = useState<FounderMemory | null>(null);
  const [ctx, setCtx] = useState<FounderCtx | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError(true); setLoading(false); return; }

        const [memRes, ctxRes] = await Promise.all([
          supabase.from("founder_memory")
            .select("avoidance_zones, strengths, personality_tags, last_insight, archetype_classified_at")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.from("founder_context")
            .select("current_stage, momentum_score, streak, days_inactive, override_reasons, topics_mentioned_repeatedly, cognitive_load, consecutive_tasks_completed, tasks_completed_total")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        setMemory(memRes.data as FounderMemory | null);
        setCtx(ctxRes.data as FounderCtx | null);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasAnyData = memory && (
    (memory.avoidance_zones?.length ?? 0) > 0 ||
    (memory.strengths?.length ?? 0) > 0 ||
    (memory.personality_tags?.length ?? 0) > 0 ||
    memory.last_insight
  );

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px 80px" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
          Founder Intelligence
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: "0 0 10px" }}>
          What BuildMind knows about you
        </h1>
        <p style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.65, margin: 0 }}>
          Every check-in, override, and reflection updates this model. The AI uses it to calibrate your daily task — your avoidance patterns, energy, and working style are all factored in.
        </p>
      </motion.div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 120, borderRadius: 14, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--bm-text4)", fontSize: 13 }}>
          Could not load your founder memory. Try refreshing.
        </div>
      )}

      <AnimatePresence>
        {!loading && !error && (
          <>
            {/* Cold start state */}
            {!hasAnyData && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ textAlign: "center", padding: "48px 24px", borderRadius: 14, border: "1px dashed var(--bm-border2)", background: "var(--bm-bg2)" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bm-text)", marginBottom: 8 }}>Learning in progress</div>
                <p style={{ fontSize: 13, color: "var(--bm-text3)", maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
                  Complete a few check-ins and the system will start building your founder profile. Avoidance patterns, strengths, and working style emerge over time.
                </p>
              </motion.div>
            )}

            {/* Execution stats */}
            {ctx && (
              <Section title="Execution stats" icon="📊">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  {[
                    { label: "Tasks completed", value: ctx.tasks_completed_total ?? 0 },
                    { label: "Current streak", value: `${ctx.streak ?? 0}d` },
                    { label: "Consecutive tasks", value: ctx.consecutive_tasks_completed ?? 0 },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "var(--bm-bg3)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--bm-text)", letterSpacing: "-0.03em" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Personality tags */}
            {memory && (memory.personality_tags?.length ?? 0) > 0 && (
              <Section title="Founder profile" icon="🧠">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(memory.personality_tags ?? []).map((tag, i) => (
                    <Tag key={tag} label={tag} index={i} />
                  ))}
                </div>
                {memory.archetype_classified_at && (
                  <p style={{ fontSize: 11, color: "var(--bm-text4)", margin: "12px 0 0" }}>
                    Profile last updated {new Date(memory.archetype_classified_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                )}
              </Section>
            )}

            {/* Avoidance zones */}
            <Section title="Avoidance zones" icon="🚧">
              <p style={{ fontSize: 12, color: "var(--bm-text4)", margin: "0 0 12px", lineHeight: 1.55 }}>
                Tasks or categories you consistently defer or override. The AI weights these when choosing your next task.
              </p>
              {(memory?.avoidance_zones?.length ?? 0) > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(memory?.avoidance_zones ?? []).map((zone, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(224,85,85,0.05)", border: "1px solid rgba(224,85,85,0.2)" }}>
                      <span style={{ fontSize: 12, color: "var(--bm-red, #E05555)", flex: 1 }}>{zone}</span>
                      <span style={{ fontSize: 10, color: "var(--bm-text4)" }}>avoided</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySlot label="No avoidance patterns detected yet — keep checking in." />
              )}
            </Section>

            {/* Strengths */}
            <Section title="Execution strengths" icon="✦">
              <p style={{ fontSize: 12, color: "var(--bm-text4)", margin: "0 0 12px", lineHeight: 1.55 }}>
                Task types you complete consistently. The AI reinforces these when you&apos;re in a momentum dip.
              </p>
              {(memory?.strengths?.length ?? 0) > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(memory?.strengths ?? []).map((s, i) => (
                    <Tag key={s} label={s} index={i + 2} />
                  ))}
                </div>
              ) : (
                <EmptySlot label="Strengths will appear after your first completed tasks." />
              )}
            </Section>

            {/* Last insight */}
            {memory?.last_insight && (
              <Section title="Last AI insight" icon="💡">
                <p style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.65, margin: 0, fontStyle: "italic", borderLeft: "2px solid var(--bm-border2)", paddingLeft: 14 }}>
                  &ldquo;{memory.last_insight}&rdquo;
                </p>
              </Section>
            )}

            {/* Repeated topics */}
            {(ctx?.topics_mentioned_repeatedly?.length ?? 0) > 0 && (
              <Section title="Topics you keep circling" icon="🔁">
                <p style={{ fontSize: 12, color: "var(--bm-text4)", margin: "0 0 12px", lineHeight: 1.55 }}>
                  Things you mention repeatedly in reflections without taking action. The AI will push you to resolve or drop these.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(ctx?.topics_mentioned_repeatedly ?? []).map((t, i) => (
                    <Tag key={t} label={t} index={i + 1} />
                  ))}
                </div>
              </Section>
            )}

            {/* Cognitive load */}
            {ctx?.cognitive_load && (
              <Section title="Today&apos;s reported capacity" icon="⚡">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>
                    {ctx.cognitive_load === "low" ? "🪫" : ctx.cognitive_load === "high" ? "🔥" : "⚡"}
                  </span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--bm-text)", textTransform: "capitalize" }}>{ctx.cognitive_load}</div>
                    <div style={{ fontSize: 12, color: "var(--bm-text4)" }}>
                      {ctx.cognitive_load === "low"
                        ? "Tasks today are scoped for low energy — light but forward-moving."
                        : ctx.cognitive_load === "high"
                        ? "High capacity reported — expect a more demanding task today."
                        : "Normal capacity — standard task difficulty."}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* Footer note */}
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              style={{ fontSize: 11, color: "var(--bm-text4)", textAlign: "center", lineHeight: 1.6, marginTop: 8 }}
            >
              This model updates automatically with every check-in, override, and reflection.
              <br />It is never shared outside your account.
            </motion.p>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
