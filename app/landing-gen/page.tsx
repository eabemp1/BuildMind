"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { storage } from "@/lib/storage";

type KitDomain = {
  name: string;
  available: boolean;
  price: string;
};

type KitColor = {
  name: string;
  hex: string;
};

type KitResult = {
  names: string[];
  tagline: string;
  positioning: string;
  colors: KitColor[];
  domains: KitDomain[];
  risks: string[];
};

const FALLBACK: KitResult = {
  names: ["NovaForge", "LaunchNest", "SignalSprint"],
  tagline: "From idea to paying users in weeks, not months.",
  positioning:
    "An execution engine for solo founders who need one high-leverage action every day.",
  colors: [
    { name: "Electric Blue", hex: "#3b82f6" },
    { name: "Cyan", hex: "#06b6d4" },
    { name: "Emerald", hex: "#10b981" },
  ],
  domains: [
    { name: "novaforge.app", available: true, price: "$16/yr" },
    { name: "launchnest.io", available: true, price: "$24/yr" },
    { name: "signalsprint.com", available: false, price: "—" },
  ],
  risks: [
    "Audience definition still broad",
    "No clear first acquisition channel",
    "Value promise needs stronger differentiation",
  ],
};

function pickPrimaryDomain(domains: KitDomain[]): string {
  const available = domains.find((d) => d.available);
  return available?.name ?? domains[0]?.name ?? "yourstartup.com";
}

function normalizeIdea(raw: string | null): string {
  const trimmed = (raw ?? "").trim();
  return trimmed || "A focused founder tool for solving a painful workflow daily.";
}

export default function LandingGenPage() {
  const [idea, setIdea] = useState<string>("");
  const [kit, setKit] = useState<KitResult>(FALLBACK);

  useEffect(() => {
    const storedIdea = normalizeIdea(storage.get("bm_startup_kit_idea"));
    const rawKit = storage.get("bm_startup_kit_result");
    let parsed = FALLBACK;
    if (rawKit) {
      try {
        const maybe = JSON.parse(rawKit) as Partial<KitResult>;
        if (Array.isArray(maybe.names) && maybe.names.length > 0) {
          parsed = {
            names: maybe.names,
            tagline: typeof maybe.tagline === "string" ? maybe.tagline : FALLBACK.tagline,
            positioning:
              typeof maybe.positioning === "string"
                ? maybe.positioning
                : FALLBACK.positioning,
            colors: Array.isArray(maybe.colors) && maybe.colors.length > 0 ? maybe.colors as KitColor[] : FALLBACK.colors,
            domains: Array.isArray(maybe.domains) && maybe.domains.length > 0 ? maybe.domains as KitDomain[] : FALLBACK.domains,
            risks: Array.isArray(maybe.risks) && maybe.risks.length > 0 ? maybe.risks : FALLBACK.risks,
          };
        }
      } catch {
        parsed = FALLBACK;
      }
    }
    setIdea(storedIdea);
    setKit(parsed);
  }, []);

  const primaryName = useMemo(() => kit.names[0] ?? "Your Startup", [kit.names]);
  const subName = useMemo(() => kit.names[1] ?? "The Better Way", [kit.names]);
  const primaryColor = useMemo(() => kit.colors[0]?.hex ?? "#3b82f6", [kit.colors]);
  const secondaryColor = useMemo(() => kit.colors[1]?.hex ?? "#06b6d4", [kit.colors]);
  const tertiaryColor = useMemo(() => kit.colors[2]?.hex ?? "#10b981", [kit.colors]);
  const primaryDomain = useMemo(() => pickPrimaryDomain(kit.domains), [kit.domains]);

  const bullets = [
    "Get one clear high-impact action every day",
    "Convert ideas into measurable user traction",
    "Run faster experiments with less wasted effort",
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 700px at 8% -10%, rgba(59,130,246,0.35), transparent 55%), radial-gradient(1000px 600px at 90% 0%, rgba(16,185,129,0.25), transparent 55%), #05070d",
        color: "#ecf3ff",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 20px 72px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Landing page preview generated from your Startup Kit</div>
          <Link href="/startup-kit" style={{ fontSize: 13, color: "#9fd2ff", textDecoration: "none" }}>
            Back to Startup Kit
          </Link>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{
            border: "1px solid rgba(164,199,255,0.18)",
            background: "linear-gradient(140deg, rgba(9,14,25,0.9), rgba(8,17,31,0.72))",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 20px 80px rgba(3,8,20,0.6)",
          }}
        >
          <div
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid rgba(164,199,255,0.14)",
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f87171" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399" }} />
            <span style={{ fontSize: 12, marginLeft: 8, color: "#9fb2cc" }}>{primaryDomain}</span>
          </div>

          <div style={{ padding: "40px 28px 34px" }}>
            <div style={{
              display: "inline-block",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.11em",
              color: "#d8e9ff",
              border: "1px solid rgba(170,206,255,0.28)",
              background: "rgba(86,146,224,0.1)",
              borderRadius: 999,
              padding: "6px 10px",
              marginBottom: 14,
            }}>
              {primaryName} for founders
            </div>

            <h1 style={{
              fontSize: "clamp(34px,6vw,64px)",
              lineHeight: 1.02,
              margin: 0,
              letterSpacing: "-0.03em",
              maxWidth: 920,
            }}>
              {kit.tagline}
            </h1>

            <p style={{ maxWidth: 760, marginTop: 16, fontSize: 16, lineHeight: 1.75, color: "#a9bfdc" }}>
              {kit.positioning}
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                color: "#031123",
                fontWeight: 700,
                border: "none",
                borderRadius: 12,
                padding: "11px 18px",
                cursor: "pointer",
              }}>
                Get Early Access
              </button>
              <button style={{
                background: "transparent",
                color: "#d4e6ff",
                border: "1px solid rgba(164,199,255,0.3)",
                borderRadius: 12,
                padding: "11px 18px",
              }}>
                See 90-second demo
              </button>
            </div>

            <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              {bullets.map((line) => (
                <div key={line} style={{
                  borderRadius: 12,
                  border: "1px solid rgba(164,199,255,0.2)",
                  background: "rgba(10,23,45,0.6)",
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "#c8dcf5",
                }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 14 }}
        >
          <div style={{ borderRadius: 18, border: "1px solid rgba(164,199,255,0.2)", background: "rgba(8,16,30,0.8)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "#9fc2ea", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              Brand Direction
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {kit.colors.map((c) => (
                <div key={c.hex} style={{ minWidth: 120, flex: 1, borderRadius: 12, border: "1px solid rgba(164,199,255,0.18)", overflow: "hidden" }}>
                  <div style={{ height: 56, background: c.hex }} />
                  <div style={{ padding: "8px 10px", background: "rgba(7,14,25,0.95)" }}>
                    <div style={{ fontSize: 12, color: "#e9f2ff" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#90a9c6", marginTop: 2 }}>{c.hex}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: "#96b0cf", lineHeight: 1.65 }}>
              Idea context: {idea}
            </div>
          </div>

          <div style={{ borderRadius: 18, border: "1px solid rgba(164,199,255,0.2)", background: "rgba(8,16,30,0.8)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "#9fc2ea", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              Domain Picks
            </div>
            {kit.domains.map((d) => (
              <div key={d.name} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid rgba(164,199,255,0.12)",
                padding: "8px 0",
                fontSize: 12,
              }}>
                <span>{d.name}</span>
                <span style={{ color: d.available ? "#6ee7b7" : "#fda4af" }}>
                  {d.available ? `Available ${d.price}` : "Taken"}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: "#a1bad8", marginTop: 12 }}>Alternative naming: {subName}</div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          style={{
            marginTop: 14,
            borderRadius: 18,
            border: "1px solid rgba(239,68,68,0.25)",
            background: "linear-gradient(140deg, rgba(64,12,19,0.55), rgba(35,9,14,0.35))",
            padding: 18,
          }}
        >
          <div style={{ fontSize: 12, color: "#fca5a5", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            De-risk First
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            {kit.risks.map((risk) => (
              <div key={risk} style={{
                borderRadius: 12,
                border: "1px solid rgba(252,165,165,0.22)",
                background: "rgba(76,17,26,0.36)",
                padding: "10px 12px",
                fontSize: 13,
                color: "#fecaca",
              }}>
                {risk}
              </div>
            ))}
          </div>
        </motion.section>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/startup-kit" style={{
            textDecoration: "none",
            border: "1px solid rgba(164,199,255,0.3)",
            color: "#d8e9ff",
            borderRadius: 12,
            padding: "10px 14px",
            fontSize: 13,
          }}>
            Regenerate from Startup Kit
          </Link>
          <Link href="/upgrade?feature=landingPageGen&plan=builder" style={{
            textDecoration: "none",
            border: "1px solid rgba(16,185,129,0.4)",
            color: "#baf6de",
            borderRadius: 12,
            padding: "10px 14px",
            fontSize: 13,
            background: `linear-gradient(135deg, ${primaryColor}22, ${tertiaryColor}22)`,
          }}>
            Publish-ready export (Builder)
          </Link>
        </div>
      </div>
    </div>
  );
}
