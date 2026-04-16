"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BrandMark } from "@/components/layout/logo";
import { setStoredPlan } from "@/lib/plan";

const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
const PAYSTACK_PLANS: Record<"builder", string> = {
  builder: process.env.NEXT_PUBLIC_PAYSTACK_PLAN_BUILDER ?? "",
};
const PAYSTACK_AMOUNTS: Record<"builder", number> = {
  builder: Number(process.env.NEXT_PUBLIC_PAYSTACK_AMOUNT_BUILDER ?? "29000"),
};
const PADDLE_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PADDLE_PRICES: Record<"builder", string> = {
  builder: process.env.NEXT_PUBLIC_PADDLE_PRICE_BUILDER ?? "",
};
const AFRICA_COUNTRIES = new Set([
  "GH","NG","KE","ZA","EG","TZ","UG","RW","CI","SN","CM","ET","TN","MA",
  "AO","ZM","ZW","MW","MZ","NA","BW","GA","BJ","TG","ML","BF","GN","SL","LR",
]);

type PaymentMethod = "paystack" | "paddle" | "auto";
type Plan = "builder";

function isPaystackPublicKeyReady(key: string): boolean {
  return /^pk_(live|test)_/i.test(key.trim());
}

function isPaddleClientTokenReady(token: string): boolean {
  // Paddle tokens are environment-scoped and may be test/live prefixed.
  return /^(pdl_)?(live|test)_/i.test(token.trim());
}

function maskSecret(value: string): string {
  if (!value) return "missing";
  if (value.length <= 10) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

const BUILDER_FEATURE_GROUPS = [
  {
    label: "Daily Execution Engine",
    color: "#6366f1",
    features: [
      { emoji: "⚡", title: "Personalized daily action — specific to YOU", desc: "Not 'talk to users'. Exactly WHO to talk to, WHAT to ask, and WHY it matters for your specific stage. Regenerates based on what you did yesterday." },
      { emoji: "🧭", title: "Momentum-aware task engine", desc: "Your tasks adapt when you're blocked, ahead, or pivoting. Free plan gives static tasks. Builder tracks your actual execution pattern and adjusts in real time." },
    ],
  },
  {
    label: "Break My Startup — Full Destruction Mode",
    color: "#ef4444",
    features: [
      { emoji: "🔥", title: "Live competitor intelligence scan", desc: "Real web scraping finds who's already solving your problem — from ProductHunt to Crunchbase. Tells you exactly how to differentiate, not just 'find your USP'." },
      { emoji: "💀", title: "Full kill-reason audit + survival probability", desc: "Every reason your startup will die, ranked by likelihood. Free plan shows a preview. Builder shows all of it — including the uncomfortable one you're avoiding." },
      { emoji: "🗡️", title: "Differentiation battle plan", desc: "3 specific actions to stand out from named competitors in 30 days. Not generic positioning advice — actual competitor names, specific angles to own." },
    ],
  },
  {
    label: "Reflect — Deep Learning Loop",
    color: "#10b981",
    features: [
      { emoji: "🧠", title: "Causality engine — why this happened", desc: "'Because you got blocked on X → tomorrow you remove that blocker first.' Not just logging outcomes. Understanding why and routing the next day accordingly." },
      { emoji: "🔄", title: "Identity reinforcement system", desc: "Tracks what kind of founder you're becoming — not just what you did. Compounds your execution identity week over week." },
    ],
  },
  {
    label: "Project Intelligence",
    color: "#f59e0b",
    features: [
      { emoji: "📊", title: "Startup score + investor signal metrics", desc: "Execution score, validation score, momentum tracking. The numbers investors care about: task completion rate, milestone velocity, signal score." },
      { emoji: "🗺️", title: "90-day venture roadmap tracks", desc: "Auto-generated milestones for your stage. Idea → Validation → MVP → Launch, with enforcement checkpoints weekly." },
      { emoji: "📋", title: "Weekly AI strategy report — every Friday", desc: "Intention vs action gap. Where your momentum is bleeding. What to fix next week. Brutal, honest, specific to your actual project data." },
    ],
  },
  {
    label: "Solo Builder Toolkit",
    color: "#8b5cf6",
    features: [
      { emoji: "🤖", title: "Unlimited AI Coach — grounded in your project", desc: "Ask anything: pricing, how to handle a bad user interview, whether to pivot. Answers grounded in your actual project context, not generic startup advice." },
      { emoji: "🧰", title: "Startup kit generator", desc: "AI-generated names, taglines, brand color palettes, and domain suggestions — ready for your project page or pitch deck." },
      { emoji: "📤", title: "#buildinpublic share cards + full data export", desc: "Weekly shareable progress card for Twitter/X. Full JSON export of your entire history — tasks, reflections, milestones. Your data, always." },
    ],
  },
];

const VS_FREE = [
  { feature: "Daily action", free: "Generic by stage", builder: "Specific to your startup + yesterday" },
  { feature: "AI Coach", free: "3/day", builder: "Unlimited, no caps" },
  { feature: "Break My Startup", free: "Preview only", builder: "Full audit + live scan" },
  { feature: "Reflect engine", free: "Basic log", builder: "Causality + identity tracking" },
  { feature: "Competitor scan", free: "Not included", builder: "Live web scan" },
  { feature: "Weekly report", free: "Not included", builder: "Every Friday" },
  { feature: "Startup score", free: "Not included", builder: "Full investor metrics" },
  { feature: "Roadmap tracks", free: "Not included", builder: "90-day execution map" },
  { feature: "Startup kit", free: "Not included", builder: "Names, colors, domains" },
  { feature: "Data export", free: "Not included", builder: "Full JSON export" },
];

async function verifyPaystackAndPersist(reference: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/billing/paystack/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
    return await res.json().catch(() => ({ ok: false }));
  } catch { return { ok: false, error: "Network error" }; }
}

async function verifyPaddleAndPersist(transactionId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/billing/paddle/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId }) });
    return await res.json().catch(() => ({ ok: false }));
  } catch { return { ok: false, error: "Network error" }; }
}

function XPBar({ value }: { value: number }) {
  return (
    <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(value, 100)}%` }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#6366f1,#8b5cf6)" }} />
    </div>
  );
}

function RegionSelector({ method, onChange }: { method: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {([{ id: "auto" as PaymentMethod, label: "Auto-detect", flag: "🌍" }, { id: "paystack" as PaymentMethod, label: "Africa (GHS)", flag: "🇬🇭" }, { id: "paddle" as PaymentMethod, label: "International", flag: "🌐" }]).map(opt => (
        <button key={opt.id} onClick={() => onChange(opt.id)} style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: method === opt.id ? 600 : 400, background: method === opt.id ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)", color: method === opt.id ? "#818cf8" : "var(--bm-text4)", transition: "all 0.15s" }}>
          {opt.flag} {opt.label}
        </button>
      ))}
    </div>
  );
}

function PayButton({ plan, method, onSuccess, onError }: { plan: Plan; method: PaymentMethod; onSuccess: (plan: string) => void; onError: (msg: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Opening payment...");
  const [detectedMethod, setDetectedMethod] = useState<"paystack" | "paddle">("paystack");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [lastError, setLastError] = useState("");
  const [paystackScriptLoaded, setPaystackScriptLoaded] = useState(false);
  const [paddleScriptLoaded, setPaddleScriptLoaded] = useState(false);
  const [paystackGlobalReady, setPaystackGlobalReady] = useState(false);
  const [paddleGlobalReady, setPaddleGlobalReady] = useState(false);
  const [paystackApiMode, setPaystackApiMode] = useState<"newTransaction" | "setup" | "unknown">("unknown");

  const paystackReady = isPaystackPublicKeyReady(PAYSTACK_KEY);
  const paddleReady = isPaddleClientTokenReady(PADDLE_TOKEN);

  const refreshDiagnostics = () => {
    if (typeof window === "undefined") return;
    const pScript = Boolean(document.getElementById("paystack-script"));
    const pdScript = Boolean(document.getElementById("paddle-script"));
    setPaystackScriptLoaded(pScript);
    setPaddleScriptLoaded(pdScript);
    const paystackGlobal = (window as any).PaystackPop;
    setPaystackGlobalReady(Boolean(paystackGlobal));
    if (paystackGlobal?.newTransaction) setPaystackApiMode("newTransaction");
    else if (paystackGlobal?.setup) setPaystackApiMode("setup");
    else setPaystackApiMode("unknown");
    setPaddleGlobalReady(Boolean((window as any).Paddle));
  };

  useEffect(() => {
    refreshDiagnostics();
  }, []);

  useEffect(() => {
    if (method !== "auto") { setDetectedMethod(method as "paystack" | "paddle"); return; }
    fetch("https://ipapi.co/json/", { cache: "no-store" }).then(r => r.json()).then((d: { country_code?: string }) => { setDetectedMethod(AFRICA_COUNTRIES.has(d.country_code ?? "") ? "paystack" : "paddle"); }).catch(() => setDetectedMethod("paystack"));
  }, [method]);

  const effectiveMethod = method === "auto" ? detectedMethod : method;
  const isPaystack = effectiveMethod === "paystack";
  const priceLabel = isPaystack ? "GHS 290/mo" : "$19/mo";

  const emitError = (msg: string) => {
    setLastError(msg);
    onError(msg);
  };

  const pay = async () => {
    setLoading(true);
    setLoadingMsg("Opening payment...");
    setLastError("");
    onError("");
    try {
      if (!paystackReady && !paddleReady) {
        setLoadingMsg("Dev mode — simulating upgrade...");
        setStoredPlan(plan);
        setTimeout(() => {
          onSuccess(plan);
          setLoading(false);
        }, 800);
        return;
      }

      let gateway: "paystack" | "paddle" = isPaystack ? "paystack" : "paddle";
      if (gateway === "paystack" && !paystackReady) gateway = "paddle";
      if (gateway === "paddle" && !paddleReady) gateway = "paystack";

      const supabase = await import("@/lib/supabase/client").then(m => m.createClient());
      const { data: authData } = await supabase.auth.getUser();
      const email = authData?.user?.email ?? "user@buildmind.app";
      const userId = authData?.user?.id ?? "";

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        setLoading(false);
      };
      const watchdog = window.setTimeout(() => {
        if (finished) return;
        const hasGatewayFrame = Boolean(
          document.querySelector('iframe[src*="paystack"], iframe[name*="paystack"], iframe[src*="paddle"]'),
        );
        if (hasGatewayFrame) return;
        emitError("Checkout did not open. Disable ad blocker/pop-up blocking and retry.");
        finish();
      }, 30000);
      const complete = () => {
        window.clearTimeout(watchdog);
        finish();
      };

      if (gateway === "paystack") {
        if (!document.getElementById("paystack-script")) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.id = "paystack-script";
            s.src = "https://js.paystack.co/v2/inline.js";
            s.onload = () => res();
            s.onerror = () => rej(new Error("Failed to load Paystack script"));
            document.head.appendChild(s);
          });
          setPaystackScriptLoaded(true);
        }
        const PaystackPop = (window as any).PaystackPop;
        setPaystackGlobalReady(Boolean(PaystackPop));
        if (PaystackPop?.newTransaction) setPaystackApiMode("newTransaction");
        else if (PaystackPop?.setup) setPaystackApiMode("setup");
        else setPaystackApiMode("unknown");
        if (!PaystackPop) {
          emitError("Paystack failed to load. Check network/ad blocker and refresh.");
          complete();
          return;
        }
        const onPaystackSuccess = async (tx: { reference?: string }) => {
          const reference = tx?.reference ?? "";
          if (!reference) {
            emitError("Paystack returned no reference. Please retry.");
            complete();
            return;
          }
          setLoadingMsg("Verifying payment...");
          const result = await verifyPaystackAndPersist(reference);
          if (result.ok) {
            setStoredPlan(plan);
            onSuccess(plan);
          } else {
            emitError(result.error ?? "Payment verification failed.");
          }
          complete();
        };

        const paystackBaseConfig = {
          key: PAYSTACK_KEY,
          email,
          amount: PAYSTACK_AMOUNTS[plan],
          currency: "GHS",
          callback_url: `${window.location.origin}/upgrade?provider=paystack`,
          metadata: { plan, user_id: userId, source: "buildmind" },
        };

        if (typeof PaystackPop.newTransaction === "function") {
          PaystackPop.newTransaction({
            ...paystackBaseConfig,
            onSuccess: onPaystackSuccess,
            onCancel: () => complete(),
          }).openIframe();
        } else if (typeof PaystackPop.setup === "function") {
          const handler = PaystackPop.setup({
            ...paystackBaseConfig,
            callback: onPaystackSuccess,
            onClose: () => complete(),
          });
          handler.openIframe();
        } else {
          emitError("Paystack loaded, but checkout API is unavailable. Please refresh.");
          complete();
        }
      } else {
        if (!document.getElementById("paddle-script")) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.id = "paddle-script";
            s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
            s.onload = () => res();
            s.onerror = () => rej(new Error("Failed to load Paddle script"));
            document.head.appendChild(s);
          });
          setPaddleScriptLoaded(true);
        }
        const Paddle = (window as any).Paddle;
        setPaddleGlobalReady(Boolean(Paddle));
        if (!Paddle) {
          emitError("Paddle failed to load. Check network/ad blocker and refresh.");
          complete();
          return;
        }
        Paddle.Initialize({ token: PADDLE_TOKEN });
        const priceId = PADDLE_PRICES[plan];
        if (!priceId) {
          setStoredPlan(plan);
          onSuccess(plan);
          complete();
          return;
        }
        Paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          customer: { email },
          settings: { theme: "dark", displayMode: "overlay" },
          successCallback: async (data: { transaction?: { id?: string } }) => {
            setLoadingMsg("Verifying payment...");
            const txId = data?.transaction?.id ?? "";
            const result = txId ? await verifyPaddleAndPersist(txId) : { ok: true };
            if (result.ok) {
              setStoredPlan(plan);
              onSuccess(plan);
            } else {
              emitError(result.error ?? "Paddle verification failed.");
            }
            complete();
          },
          closeCallback: () => complete(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment setup failed. Please retry.";
      emitError(message);
      setLoading(false);
      refreshDiagnostics();
    }
  };

  return (
    <div>
      <motion.button onClick={() => void pay()} disabled={loading} whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }}
        style={{ width: "100%", padding: "16px 0", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 15, borderRadius: 14, border: "none", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.75 : 1, boxShadow: "0 0 32px rgba(99,102,241,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {loading ? (<><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white" }} />{loadingMsg}</>) : `Upgrade to Builder — ${priceLabel} →`}
      </motion.button>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={() => { setDiagnosticsOpen(!diagnosticsOpen); refreshDiagnostics(); }}
          style={{ width: "100%", background: "transparent", border: "1px solid var(--bm-border2)", color: "var(--bm-text3)", borderRadius: 8, padding: "8px 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}
        >
          {diagnosticsOpen ? "Hide" : "Show"} payment diagnostics
        </button>
      </div>

      {diagnosticsOpen && (
        <div style={{ marginTop: 8, borderRadius: 8, border: "1px solid var(--bm-border2)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", fontSize: 11, color: "var(--bm-text3)", fontFamily: "monospace", lineHeight: 1.7 }}>
          <div>effective_method: {effectiveMethod}</div>
          <div>paystack_key: {paystackReady ? "ready" : "missing/invalid"} ({maskSecret(PAYSTACK_KEY)})</div>
          <div>paddle_token: {paddleReady ? "ready" : "missing/invalid"} ({maskSecret(PADDLE_TOKEN)})</div>
          <div>paystack_script_tag: {paystackScriptLoaded ? "present" : "missing"}</div>
          <div>paystack_global: {paystackGlobalReady ? "ready" : "missing"}</div>
          <div>paystack_api_mode: {paystackApiMode}</div>
          <div>paddle_script_tag: {paddleScriptLoaded ? "present" : "missing"}</div>
          <div>paddle_global: {paddleGlobalReady ? "ready" : "missing"}</div>
          <div>last_error: {lastError || "none"}</div>
          <div>tip: disable ad blockers/pop-up blocking for this site if scripts fail.</div>
        </div>
      )}
    </div>
  );
}

function UpgradeContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tasksCompleted = Number(params.get("tasks") ?? "2");
  const streak = Number(params.get("streak") ?? "1");
  const selectedPlan: Plan = "builder";
  const [payMethod, setPayMethod] = useState<PaymentMethod>("auto");
  const [upgraded, setUpgraded] = useState(false);
  const [payError, setPayError] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const xp = Math.min(tasksCompleted * 15, 100);

  const handleSuccess = (plan: string) => { setUpgraded(true); setTimeout(() => router.push(`/dashboard?upgraded=${plan}`), 1000); };

  if (upgraded) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center" }}>
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.5 }} style={{ fontSize: 56, marginBottom: 16 }}>🎉</motion.div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Payment confirmed.</div>
          <div style={{ fontSize: 13, color: "var(--bm-text3)" }}>Taking you to your dashboard...</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui,sans-serif", paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px 20px 0", marginBottom: 8 }}>
        <BrandMark size={22} href="/dashboard" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--bm-text)" }}>BuildMind</span>
      </div>
      <div style={{ maxWidth: 500, margin: "0 auto", padding: "0 16px" }}>

        {/* Momentum */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 280, damping: 24 }}
          style={{ border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.05)", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: 2, delay: 0.5 }} style={{ fontSize: 24 }}>🔥</motion.span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>You&apos;re making real progress.</div>
              <div style={{ fontSize: 11, color: "var(--bm-text2)", marginTop: 2 }}>{tasksCompleted} task{tasksCompleted !== 1 ? "s" : ""} done · {streak} day streak. Builder removes every limit.</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10, color: "var(--bm-text3)", fontFamily: "monospace" }}>XP {Math.min(xp, 100)}/100</span>
            <XPBar value={xp} />
            <span style={{ fontSize: 10, color: "#818cf8" }}>Builder unlocks →</span>
          </div>
        </motion.div>

        {/* Main feature card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          style={{ borderRadius: 16, padding: "20px 20px", background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))", border: "1px solid rgba(129,140,248,0.25)", marginBottom: 10 }}>
          <AnimatePresence mode="wait">
            <motion.div key={selectedPlan} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 34, fontWeight: 600, color: "var(--bm-text)", letterSpacing: "-0.03em" }}>GHS 290</span>
                <span style={{ fontSize: 13, color: "var(--bm-text3)" }}>/month</span>
                <span style={{ fontSize: 11, color: "#555" }}>(~$19 USD)</span>
                <span style={{ padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", fontSize: 10, color: "#a78bfa" }}>Popular</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 20 }}>
                Everything a solo founder needs — personalized to your actual startup
              </p>
            </motion.div>
          </AnimatePresence>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {BUILDER_FEATURE_GROUPS.map((group, gi) => (
              <motion.div key={group.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + gi * 0.06 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: group.color, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                  {group.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.features.map(f => (
                    <div key={f.title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{f.emoji}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text)", marginBottom: 2 }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.55 }}>{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}

          </div>
        </motion.div>

        {/* VS comparison toggle */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ marginBottom: 10 }}>
          <button onClick={() => setShowComparison(!showComparison)}
            style={{ width: "100%", padding: "10px 0", background: "transparent", border: "1px solid var(--bm-border2)", borderRadius: 10, fontSize: 11, color: "var(--bm-text3)", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
            {showComparison ? "▲ Hide" : "▼ Show"} Builder vs Free — full comparison
          </button>
          <AnimatePresence>
            {showComparison && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden", borderRadius: 12, border: "1px solid var(--bm-border2)", background: "rgba(255,255,255,0.02)", marginTop: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.3fr", gap: 6, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 10, color: "var(--bm-text4)", fontWeight: 600 }}>Feature</div>
                  <div style={{ fontSize: 10, color: "#444", fontWeight: 600 }}>Free</div>
                  <div style={{ fontSize: 10, color: "#818cf8", fontWeight: 600 }}>Builder</div>
                </div>
                {VS_FREE.map((row, i) => (
                  <div key={row.feature} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.3fr", gap: 6, padding: "9px 12px", borderBottom: i < VS_FREE.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none", alignItems: "start" }}>
                    <div style={{ fontSize: 11, color: "var(--bm-text2)", fontWeight: 500 }}>{row.feature}</div>
                    <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>{row.free}</div>
                    <div style={{ fontSize: 10, color: "#818cf8", fontFamily: "monospace", fontWeight: 600 }}>{row.builder}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Payment section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          style={{ borderRadius: 14, padding: 18, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--bm-text4)", marginBottom: 6, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment method</div>
            <RegionSelector method={payMethod} onChange={setPayMethod} />
            <div style={{ fontSize: 10, color: "#334155", marginTop: 5, fontFamily: "monospace" }}>
              {payMethod === "paystack" && "Paystack — GHS, NGN, KES · secure African payments"}
              {payMethod === "paddle" && "Paddle — USD, EUR, GBP · international"}
              {payMethod === "auto" && "Detecting your region automatically..."}
            </div>
          </div>
          {payError && (
            <div style={{ fontSize: 12, color: "#f87171", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              {payError} <a href="mailto:support@buildmind.app" style={{ color: "#818cf8" }}>Contact support</a>
            </div>
          )}
          <PayButton plan={selectedPlan} method={payMethod} onSuccess={handleSuccess} onError={setPayError} />
          <p style={{ fontSize: 11, color: "#1e293b", textAlign: "center", marginTop: 10 }}>Cancel anytime · No questions asked · Secure payment</p>
        </motion.div>

        {/* Annual teaser */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          style={{ borderRadius: 12, border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.04)", padding: "12px 14px", display: "flex", gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📅</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fbbf24" }}>Annual plans coming — save 40%</div>
            <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 3, fontFamily: "monospace" }}>Builder GHS 2,088/yr.</div>
          </div>
        </motion.div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/today" style={{ fontSize: 12, color: "var(--bm-text4)", textDecoration: "none" }}>Continue with free access →</Link>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return <Suspense fallback={<div style={{ minHeight: "100vh" }} />}><UpgradeContent /></Suspense>;
}
