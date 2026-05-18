"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to Sentry / structured logger if available
    if (typeof window !== "undefined" && (window as any).__sentry_captured !== error.digest) {
      console.error("[BuildMind] Unhandled error:", error);
      (window as any).__sentry_captured = error.digest;
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bm-bg, #0a0a0f)",
        color: "var(--bm-text, #e8e8f0)",
        fontFamily: "inherit",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(239, 68, 68, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          marginBottom: 24,
        }}
      >
        ⚡
      </div>

      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 10,
          color: "var(--bm-text, #e8e8f0)",
        }}
      >
        Something went wrong
      </h1>

      <p
        style={{
          fontSize: 14,
          color: "var(--bm-text3, #6b7280)",
          maxWidth: 360,
          lineHeight: 1.6,
          marginBottom: 32,
        }}
      >
        BuildMind hit an unexpected error. Your data is safe — this is likely a
        temporary issue. Try refreshing, or return to the dashboard.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: "var(--grad-primary, linear-gradient(135deg, #6366f1, #8b5cf6))",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Try again
        </button>

        <a
          href="/today"
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid var(--bm-border, rgba(255,255,255,0.08))",
            background: "transparent",
            color: "var(--bm-text2, #a1a1b5)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Go to dashboard
        </a>
      </div>

      {error.digest && (
        <p
          style={{
            marginTop: 32,
            fontSize: 11,
            color: "var(--bm-text3, #6b7280)",
            fontFamily: "monospace",
          }}
        >
          Error ID: {error.digest}
        </p>
      )}
    </div>
  );
}
