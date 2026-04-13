"use client";

/**
 * components/ui/AIVisualWidget.tsx
 *
 * Drop this anywhere in the app to get an AI-generated rich visualization
 * for that page's context. Uses /api/ai/generate-ui under the hood.
 *
 * Usage:
 *   <AIVisualWidget
 *     page="today"
 *     intent="Show founder's daily momentum summary"
 *     context={{ stage, streak, score }}
 *     data={{ tasksDone, recentActions }}
 *   />
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AIVisualWidgetProps {
  page: string;
  intent: string;
  context?: Record<string, unknown>;
  data?: Record<string, unknown>;
  /** Label shown on the generate button. Default: "Generate insight" */
  label?: string;
  /** Auto-generate on mount without waiting for user click */
  autoGenerate?: boolean;
  /** Optional className for wrapper */
  className?: string;
}

// Shimmer skeleton
function Skeleton() {
  return (
    <div style={{ padding: "16px 0" }}>
      {[90, 60, 75, 45].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 18 : 12,
            width: `${w}%`,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 6,
            marginBottom: 10,
            animation: "bm-shimmer 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes bm-shimmer {
          0%,100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

export function AIVisualWidget({
  page,
  intent,
  context,
  data,
  label = "Generate insight",
  autoGenerate = false,
  className,
}: AIVisualWidgetProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(200);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, intent, context, data }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed");
      setHtml(json.html);
      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoGenerate) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  // Auto-resize iframe to content height
  useEffect(() => {
    if (!html || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const onLoad = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight;
        if (h && h > 0) setIframeHeight(h + 24);
      } catch {}
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  const wrappedHtml = html
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;padding:0;}
      </style></head><body>${html}</body></html>`
    : "";

  return (
    <div
      className={className}
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: generated ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>
            AI Insight
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {generated && (
            <button
              onClick={generate}
              disabled={loading}
              style={{
                fontSize: 10, color: "#6366f1", background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6,
                padding: "3px 9px", cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: loading ? 0.5 : 1,
              }}
            >
              Refresh
            </button>
          )}
          {!generated && !loading && (
            <button
              onClick={generate}
              style={{
                fontSize: 11, color: "white",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                border: "none", borderRadius: 7,
                padding: "5px 12px", cursor: "pointer",
                fontFamily: "inherit", fontWeight: 600,
              }}
            >
              {label}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ padding: "0 16px 8px" }}
          >
            <Skeleton />
          </motion.div>
        )}

        {error && !loading && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: "12px 16px" }}
          >
            <div style={{ fontSize: 11, color: "#f87171" }}>
              {error.includes("not configured")
                ? "AI not configured — add GROQ_API_KEY to your environment."
                : `Failed: ${error}`}
            </div>
          </motion.div>
        )}

        {html && !loading && (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={wrappedHtml}
              style={{
                width: "100%",
                height: iframeHeight,
                border: "none",
                display: "block",
                background: "transparent",
              }}
              sandbox="allow-scripts"
              title="AI generated insight"
            />
          </motion.div>
        )}

        {!generated && !loading && !error && (
          <motion.div
            key="empty"
            style={{ padding: "8px 16px 14px" }}
          >
            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
              {intent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AIVisualWidget;
