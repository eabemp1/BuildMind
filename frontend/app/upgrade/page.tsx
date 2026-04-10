"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/layout/logo";
import { setStoredPlan } from "@/lib/plan";

type PaymentMethod = "paystack" | "paddle" | "auto";

type PaymentSuccess = {
  onReference: (referenceOrId: string) => Promise<void>;
  onCancel: () => void;
  email: string;
};

const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
const PAYSTACK_PLAN_BUILDER = process.env.NEXT_PUBLIC_PAYSTACK_PLAN_BUILDER ?? "";
const PAYSTACK_AMOUNT_BUILDER = 29000;

const PADDLE_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PADDLE_PRICE_BUILDER = process.env.NEXT_PUBLIC_PADDLE_PRICE_BUILDER ?? "";

const AFRICA_COUNTRIES = new Set([
  "GH", "NG", "KE", "ZA", "EG", "TZ", "UG", "RW", "CI", "SN", "CM", "ET", "TN", "MA",
  "AO", "ZM", "ZW", "MW", "MZ", "NA", "BW", "GA", "BJ", "TG", "ML", "BF", "GN", "GW",
  "SL", "LR", "ER", "DJ", "SO", "SS", "SD", "CF", "CG", "CD", "MG", "MU", "SC", "CV",
]);

const BUILDER_FEATURES = [
  { emoji: "⚡", title: "Unlimited daily execution", desc: "No more free-plan caps. Keep shipping without interruption." },
  { emoji: "🤖", title: "Unlimited AI Coach", desc: "Ask follow-up questions until the problem is actually solved." },
  { emoji: "🔥", title: "Full Break My Startup", desc: "Get the complete survival analysis, kill reasons, and brutally clear next move." },
  { emoji: "📋", title: "Weekly AI reports", desc: "See your momentum, your blind spots, and what needs fixing next." },
  { emoji: "🧠", title: "Startup kit generator", desc: "Names, taglines, branding direction, and launch assets in one place." },
  { emoji: "📊", title: "Execution metrics", desc: "Track your score, progress, and consistency with cleaner accountability." },
];

function FeatureRow({ emoji, title, desc, delay }: { emoji: string; title: string; desc: string; delay: number }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setChecked(true), delay * 1000 + 250);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
      style={{ display: "flex", alignItems: "flex-start", gap: 12 }}
    >
      <motion.div
        animate={checked ? { scale: [1, 1.25, 1], backgroundColor: ["#111", "#16a34a", "#16a34a"] } : {}}
        transition={{ duration: 0.3 }}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          flexShrink: 0,
          marginTop: 1,
          background: checked ? "#16a34a" : "#111",
          border: checked ? "none" : "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <span style={{ fontSize: 11, color: "#fff" }}>✓</span> : null}
      </motion.div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>{emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>{title}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </motion.div>
  );
}

function XPBar({ value }: { value: number }) {
  return (
    <div style={{ height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
        style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#6366f1,#8b5cf6)" }}
      />
    </div>
  );
}

function RegionSelector({ method, onChange }: { method: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const options: { id: PaymentMethod; label: string; flag: string }[] = [
    { id: "auto", label: "Auto-detect", flag: "🌍" },
    { id: "paystack", label: "Africa (GHS)", flag: "🇬🇭" },
    { id: "paddle", label: "International (USD)", flag: "🌐" },
  ];

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          style={{
            flex: 1,
            padding: "6px 4px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: method === opt.id ? 600 : 400,
            background: method === opt.id ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
            color: method === opt.id ? "#818cf8" : "var(--bm-text4)",
            transition: "all 0.15s",
          }}
        >
          {opt.flag} {opt.label}
        </button>
      ))}
    </div>
  );
}

async function payWithPaystack({ email, onReference, onCancel }: PaymentSuccess) {
  if (!document.getElementById("paystack-script")) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.id = "paystack-script";
      script.src = "https://js.paystack.co/v2/inline.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Paystack failed to load"));
      document.head.appendChild(script);
    });
  }

  const PaystackPop = (window as any).PaystackPop;
  if (!PaystackPop) {
    onCancel();
    return;
  }

  PaystackPop.newTransaction({
    key: PAYSTACK_KEY,
    email,
    amount: PAYSTACK_AMOUNT_BUILDER,
    currency: "GHS",
    ...(PAYSTACK_PLAN_BUILDER ? { plan: PAYSTACK_PLAN_BUILDER } : {}),
    metadata: { plan: "builder", source: "buildmind" },
    onSuccess: async (tx: { reference: string }) => {
      await onReference(tx.reference);
    },
    onCancel,
  }).openIframe();
}

async function payWithPaddle({ email, onReference, onCancel }: PaymentSuccess) {
  if (!document.getElementById("paddle-script")) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.id = "paddle-script";
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Paddle failed to load"));
      document.head.appendChild(script);
    });
  }

  const Paddle = (window as any).Paddle;
  if (!Paddle) {
    onCancel();
    return;
  }

  Paddle.Initialize({ token: PADDLE_TOKEN });

  if (!PADDLE_PRICE_BUILDER) {
    throw new Error("Paddle price id is missing.");
  }

  Paddle.Checkout.open({
    items: [{ priceId: PADDLE_PRICE_BUILDER, quantity: 1 }],
    customer: { email },
    settings: { theme: "dark", displayMode: "overlay", frameTarget: "self" },
    successCallback: async (checkout: { transaction_id?: string; transactionId?: string; id?: string }) => {
      const id = checkout.transaction_id ?? checkout.transactionId ?? checkout.id ?? "";
      await onReference(String(id));
    },
    closeCallback: onCancel,
  });
}

function PayButton({ method, onSuccess }: { method: PaymentMethod; onSuccess: (plan: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectedMethod, setDetectedMethod] = useState<"paystack" | "paddle">("paystack");

  useEffect(() => {
    if (method !== "auto") {
      setDetectedMethod(method as "paystack" | "paddle");
      return;
    }

    fetch("https://ipapi.co/json/")
      .then((res) => res.json())
      .then((data) => {
        setDetectedMethod(AFRICA_COUNTRIES.has(data.country_code) ? "paystack" : "paddle");
      })
      .catch(() => setDetectedMethod("paystack"));
  }, [method]);

  const effectiveMethod = method === "auto" ? detectedMethod : method;
  const isPaystack = effectiveMethod === "paystack";
  const priceLabel = isPaystack ? "GHS 290/mo" : "$19/mo";

  const pay = async () => {
    setLoading(true);
    setError("");

    try {
      const paystackReady = PAYSTACK_KEY.startsWith("pk_");
      const paddleReady = PADDLE_TOKEN.startsWith("live_");

      if (!paystackReady && !paddleReady) {
        throw new Error("Payment providers are not configured yet.");
      }

      async function confirmBuilderWithServer(provider: "paystack" | "paddle", referenceOrId: string) {
        if (!referenceOrId) throw new Error(`${provider} did not return a transaction reference.`);

        const endpoint = provider === "paystack" ? "/api/billing/paystack/verify" : "/api/billing/paddle/verify";
        const key = provider === "paystack" ? "reference" : "transactionId";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: referenceOrId }),
        });

        const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error ?? "Payment verification failed.");
        }

        setStoredPlan("builder");
        onSuccess("builder");
      }

      const supabase = await import("@/lib/supabase/client").then((m) => m.createClient());
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message);
      const email = data.user?.email ?? "user@buildmind.app";
      const makeShared = (provider: "paystack" | "paddle") => ({
        email,
        onCancel: () => setLoading(false),
        onReference: async (referenceOrId: string) => {
          await confirmBuilderWithServer(provider, referenceOrId);
        },
      });

      if (isPaystack && paystackReady) {
        await payWithPaystack(makeShared("paystack"));
        return;
      }

      if (!isPaystack && paddleReady) {
        await payWithPaddle(makeShared("paddle"));
        return;
      }

      if (paystackReady) {
        await payWithPaystack(makeShared("paystack"));
      } else {
        await payWithPaddle(makeShared("paddle"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete payment.");
      setLoading(false);
    }
  };

  return (
    <>
      <motion.button
        onClick={() => void pay()}
        disabled={loading}
        whileHover={{ scale: loading ? 1 : 1.02 }}
        whileTap={{ scale: loading ? 1 : 0.98 }}
        style={{
          width: "100%",
          padding: "14px 0",
          marginTop: 20,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          borderRadius: 12,
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          opacity: loading ? 0.75 : 1,
          boxShadow: "0 0 28px rgba(99,102,241,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {loading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white" }}
            />
            Opening payment...
          </>
        ) : (
          `Upgrade to Builder — ${priceLabel} →`
        )}
      </motion.button>
      {error ? <p style={{ marginTop: 10, fontSize: 11, color: "#f87171", textAlign: "center" }}>{error}</p> : null}
    </>
  );
}

function UpgradeContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tasksCompleted = Number(params.get("tasks") ?? "2");
  const streak = Number(params.get("streak") ?? "1");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("auto");
  const [upgraded, setUpgraded] = useState(false);

  const xp = Math.min(tasksCompleted * 15, 100);

  const handleSuccess = (plan: string) => {
    setUpgraded(true);
    setTimeout(() => router.push(`/dashboard?upgraded=${plan}`), 1200);
  };

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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "32px 16px 60px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
        <BrandMark size={24} href="/dashboard" />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--bm-text)" }}>BuildMind</span>
      </div>

      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 14 }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
          style={{ border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.05)", borderRadius: 16, padding: 16 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <motion.span animate={{ scale: [1, 1.25, 1], rotate: [0, 8, -8, 0] }} transition={{ duration: 1, repeat: 2, delay: 0.5 }} style={{ fontSize: 28 }}>🔥</motion.span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--bm-text)" }}>You already have momentum.</div>
              <div style={{ fontSize: 11, color: "var(--bm-text2)", marginTop: 2 }}>
                {tasksCompleted} task{tasksCompleted !== 1 ? "s" : ""} done · {streak} day streak. Keep the engine on.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10, color: "var(--bm-text3)", whiteSpace: "nowrap", fontFamily: "monospace" }}>XP {Math.min(xp, 100)}/100</span>
            <XPBar value={xp} />
            <span style={{ fontSize: 10, color: "#818cf8", whiteSpace: "nowrap" }}>Builder unlocks →</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{ borderRadius: 16, padding: 20, background: "linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.06))", border: "1px solid rgba(129,140,248,0.3)" }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 38, fontWeight: 600, color: "var(--bm-text)", letterSpacing: "-0.03em" }}>GHS 290</span>
            <span style={{ fontSize: 14, color: "var(--bm-text3)" }}>/month</span>
            <span style={{ fontSize: 11, color: "#818cf8" }}>(~$19 USD)</span>
            <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", fontSize: 10, color: "#a78bfa" }}>Most popular</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--bm-text3)", marginBottom: 20 }}>
            Everything you need to keep shipping without limits.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {BUILDER_FEATURES.map((feature, index) => (
              <FeatureRow key={feature.title} {...feature} delay={0.08 + index * 0.05} />
            ))}
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--bm-text4)", marginBottom: 6, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment method</div>
            <RegionSelector method={payMethod} onChange={setPayMethod} />
            <div style={{ fontSize: 10, color: "#334155", fontFamily: "monospace", marginTop: 4 }}>
              {payMethod === "paystack" && "Paystack — GHS, NGN, KES and more African currencies"}
              {payMethod === "paddle" && "Paddle — USD, EUR, GBP and international cards"}
              {payMethod === "auto" && "Auto-detecting your region..."}
            </div>
          </div>

          <PayButton method={payMethod} onSuccess={handleSuccess} />
          <p style={{ fontSize: 11, color: "#1e293b", textAlign: "center", marginTop: 10 }}>Cancel anytime · No questions asked</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", padding: "14px 16px" }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text)", marginBottom: 6 }}>What changes on Builder?</div>
          <div style={{ fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.7 }}>
            Your free account stays intact. Builder simply removes limits and unlocks the deeper strategy tools that already fit your workflow.
          </div>
        </motion.div>

        <div style={{ textAlign: "center" }}>
          <Link href="/today" style={{ fontSize: 12, color: "var(--bm-text4)", textDecoration: "none" }}>
            Continue with free access →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <UpgradeContent />
    </Suspense>
  );
}
