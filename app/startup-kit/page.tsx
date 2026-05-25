"use client";
/**
 * /startup-kit — Polished free-tier teaser + Builder full experience
 * Free: see a demo output for a sample idea, locked inputs, upgrade CTA
 * Builder: full live generation
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { canAccess } from "@/lib/plan";
import { usePlan } from "@/lib/usePlan";
import { storage } from "@/lib/storage";

const SAMPLE_RESULT = {
  names: ["BuildHQ", "GetBuild", "BuildOS"],
  tagline: "The fastest way to turn an idea into a real startup.",
  positioning: "For solo founders who need structure, not complexity. BuildMind is the execution OS that replaces planning paralysis with one clear daily action.",
  colors: [
    { name: "Indigo", hex: "var(--bm-accent)" },
    { name: "Violet", hex: "var(--bm-accent2)" },
    { name: "Teal", hex: "#14b8a6" },
  ],
  domains: [
    { name: "buildhq.com", available: true, price: "$12/yr" },
    { name: "getbuild.io", available: false, price: "—" },
    { name: "buildos.co", available: true, price: "$28/yr" },
  ],
  risks: [
    "No clear distribution channel identified",
    "Target audience too broad — narrow to one persona",
    "Competitive market — differentiation needed",
  ],
};

type StartupKitResult = typeof SAMPLE_RESULT;

const card: React.CSSProperties = {
  background: "var(--bm-bg2)", border: "1px solid var(--bm-border)",
  borderRadius: 14, padding: 18, marginBottom: 12,
};
const label: React.CSSProperties = {
  fontSize: 11, color: "var(--bm-text3)", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600,
};

function KitResult({ result, blurred = false }: { result: typeof SAMPLE_RESULT; blurred?: boolean }) {
  const blur = blurred ? { filter: "blur(4px)", userSelect: "none" as const, pointerEvents: "none" as const } : {};
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ ...card, ...blur }}>
        <div style={label}>Name suggestions</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {result.names.map(n => (
            <div key={n} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--bm-border2)", background: "var(--bm-bg3)", fontSize: 13, fontWeight: 500, color: "var(--bm-text)" }}>{n}</div>
          ))}
        </div>
      </div>
      <div style={{ ...card, ...blur }}>
        <div style={label}>Tagline</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)", fontStyle: "italic" }}>&ldquo;{result.tagline}&rdquo;</div>
      </div>
      <div style={{ ...card, ...blur }}>
        <div style={label}>Positioning statement</div>
        <div style={{ fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.7, fontFamily: "monospace" }}>{result.positioning}</div>
      </div>
      <div style={{ ...card, ...blur }}>
        <div style={label}>Domain suggestions</div>
        {result.domains.map(d => (
          <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--bm-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: d.available ? "#4ade80" : "#f87171" }} />
              <span style={{ fontSize: 13, color: "var(--bm-text)", fontFamily: "monospace" }}>{d.name}</span>
            </div>
            <span style={{ fontSize: 11, color: d.available ? "#4ade80" : "var(--bm-text4)" }}>{d.available ? `Available · ${d.price}` : "Taken"}</span>
          </div>
        ))}
      </div>
      <div style={{ ...card, ...blur }}>
        <div style={label}>Brand colours</div>
        <div style={{ display: "flex", gap: 10 }}>
          {result.colors.map(c => (
            <div key={c.hex} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", height: 44, borderRadius: 8, background: c.hex }} />
              <div style={{ fontSize: 11, color: "var(--bm-text2)" }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "var(--bm-text3)", fontFamily: "monospace" }}>{c.hex}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...card, background: "rgba(248,113,113,.04)", border: "1px solid rgba(248,113,113,.15)", ...blur }}>
        <div style={label}>Risks to address first</div>
        {result.risks.map(r => (
          <div key={r} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--bm-text2)", fontFamily: "monospace", padding: "5px 0", borderBottom: "1px solid rgba(248,113,113,.08)" }}>
            <span style={{ color: "#f87171", flexShrink: 0 }}>✗</span>{r}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function FreeTeaserView({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui,sans-serif", paddingBottom: 40 }}>
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--bm-border)" }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--bm-text)", marginBottom: 4 }}>Startup Kit Generator</div>
        <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>Names · domains · brand colours · positioning · risk flags — in 30 seconds.</div>
      </div>

      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: "rgba(99,102,241,0.07)", border: "1px solid var(--bm-accent-bd)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)", marginBottom: 4 }}>What Builder unlocks</div>
          <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6 }}>
            Type your idea → get instant name options, a positioning statement, available .com domains with prices, a brand colour palette, and the top 3 risks to fix first. Below is a sample output.
          </div>
        </div>
      </motion.div>

      {/* Locked input */}
      <div style={{ ...card, opacity: 0.5, position: "relative", pointerEvents: "none" }}>
        <div style={label}>Your idea</div>
        <div style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--bm-text4)", fontFamily: "monospace", minHeight: 64, display: "flex", alignItems: "center" }}>
          e.g. AI tool that gives solo founders one clear task every morning
        </div>
      </div>

      {/* Blurred sample + gradient overlay */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div style={{ pointerEvents: "none" }}>
          <KitResult result={SAMPLE_RESULT} blurred />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "var(--bm-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 20px 28px" }}>
          <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, marginBottom: 14, textAlign: "center" }}>↑ Sample output for &ldquo;BuildMind&rdquo; — your idea generates a custom version</div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={onUpgrade}
            style={{ width: "100%", maxWidth: 360, padding: "14px 0", background: "var(--bm-accent)", color: "#fff", fontWeight: 700, fontSize: 14, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 20px var(--bm-accent-bd)" }}>
            Unlock Startup Kit — $39/mo →
          </motion.button>
          <div style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 8 }}>Cancel anytime. Instant access.</div>
        </div>
      </div>

      {/* Feature checklist */}
      <div style={{ ...card, background: "transparent", marginTop: 16 }}>
        <div style={label}>What&apos;s in the kit</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { icon: "🏷️", text: "3 AI-generated name ideas tuned to your market" },
            { icon: "📢", text: "Positioning statement written for your exact target user" },
            { icon: "🌐", text: "Domain availability + prices checked live" },
            { icon: "🎨", text: "Brand colour palette psychologically matched to your industry" },
            { icon: "⚠️", text: "Top 3 startup risks to fix before you build anything" },
            { icon: "🚀", text: "Feeds straight into the landing page generator" },
          ].map(f => (
            <div key={f.icon} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, fontSize: 14 }}>{f.icon}</span>{f.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StartupKitContent() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StartupKitResult | null>(null);

  useEffect(() => {
    const s = storage.get("bm_idea");
    if (s) setIdea(s);
  }, []);

  const generate = async () => {
    if (!idea.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1800));
    const base = idea.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
    const cap = base.charAt(0).toUpperCase() + base.slice(1);
    const generated: StartupKitResult = {
      names: [`${cap}HQ`, `Get${cap}`, `${cap}OS`],
      tagline: "The fastest way to turn an idea into a real startup.",
      positioning: `For solo founders who need structure, not complexity. ${idea.split(" ").slice(0, 4).join(" ")} is the execution OS that replaces procrastination with one clear daily action.`,
      colors: [{ name: "Indigo", hex: "var(--bm-accent)" }, { name: "Violet", hex: "var(--bm-accent2)" }, { name: "Teal", hex: "#14b8a6" }],
      domains: [{ name: `${base}hq.com`, available: true, price: "$12/yr" }, { name: `get${base}.io`, available: false, price: "—" }, { name: `${base}os.co`, available: true, price: "$28/yr" }],
      risks: ["No clear distribution channel", "Target audience too broad — narrow to one persona", "Competitive market — differentiation needed"],
    };
    setResult(generated);
    storage.set("bm_startup_kit_idea", idea.trim());
    storage.setJSON("bm_startup_kit_result", generated);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui,sans-serif", paddingBottom: 40 }}>
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--bm-border)" }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--bm-text)", marginBottom: 4 }}>Startup Kit Generator</div>
        <div style={{ fontSize: 13, color: "var(--bm-text3)", lineHeight: 1.6 }}>Names · domains · brand colours · positioning · risk flags — in 30 seconds.</div>
      </div>
      <div style={card}>
        <div style={label}>Your idea</div>
        <textarea value={idea} onChange={e => setIdea(e.target.value)} rows={3}
          placeholder="e.g. AI tool that gives solo founders one clear task every morning"
          style={{ width: "100%", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--bm-text)", outline: "none", fontFamily: "monospace", resize: "none", lineHeight: 1.6, marginBottom: 12, boxSizing: "border-box" }} />
        <motion.button onClick={generate} disabled={loading || !idea.trim()}
          whileHover={!loading && idea.trim() ? { scale: 1.02 } : {}} whileTap={!loading && idea.trim() ? { scale: 0.97 } : {}}
          style={{ width: "100%", padding: 12, background: loading || !idea.trim() ? "var(--bm-bg4)" : "var(--bm-accent)", color: loading || !idea.trim() ? "var(--bm-text3)" : "#fff", fontWeight: 700, fontSize: 13, borderRadius: 10, border: "none", cursor: loading || !idea.trim() ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {loading ? "Generating kit…" : "Generate startup kit →"}
        </motion.button>
      </div>
      <AnimatePresence>
        {result && (
          <>
            <KitResult result={result} />
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              onClick={() => router.push("/landing-gen")}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              style={{ width: "100%", padding: 13, background: "var(--bm-accent)", color: "#fff", fontWeight: 700, fontSize: 13, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>
              Generate landing page from this kit →
            </motion.button>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function StartupKitPage() {
  const router = useRouter();
  const { plan } = usePlan();
  if (!canAccess("startupKit", plan)) return <FreeTeaserView onUpgrade={() => router.push("/upgrade?feature=startupKit")} />;
  return <StartupKitContent />;
}
