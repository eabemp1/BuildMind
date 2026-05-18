"use client";

/**
 * components/AIErrorBoundary.tsx
 *
 * Error boundary for AI-powered surfaces (Coach, Break My Startup, Insights,
 * Morning Briefing, Recovery Mode). A failed AI call must not blank the whole
 * feature — it should show a calm, branded fallback with a retry option.
 *
 * Usage:
 *   <AIErrorBoundary feature="AI Coach">
 *     <CoachPanel />
 *   </AIErrorBoundary>
 *
 * Also exports `withAIErrorBoundary` HOC for quick wrapping:
 *   export default withAIErrorBoundary(MyAIComponent, "Break My Startup");
 */

import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Feature name shown in fallback UI ("AI Coach", "Break My Startup", …) */
  feature?: string;
  /** Optional custom fallback — overrides the default green-themed card */
  fallback?: ReactNode;
  /** Called when an error is caught — use to captureError() to Sentry */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
}

export class AIErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
    // Log to console in dev; in production errorReporter handles Sentry.
    if (process.env.NODE_ENV !== "production") {
      console.error(`[AIErrorBoundary: ${this.props.feature ?? "AI"}]`, error, info);
    }
  }

  handleRetry = () => {
    this.setState((s) => ({ hasError: false, error: null, retryKey: s.retryKey + 1 }));
  };

  render() {
    if (!this.state.hasError) {
      return (
        <React.Fragment key={this.state.retryKey}>
          {this.props.children}
        </React.Fragment>
      );
    }

    if (this.props.fallback) return this.props.fallback;

    const feature = this.props.feature ?? "AI";

    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "32px 24px",
          background: "rgba(16,185,129,0.04)",
          border: "1px solid rgba(16,185,129,0.15)",
          borderRadius: "12px",
          textAlign: "center",
          minHeight: "140px",
        }}
      >
        <div style={{ fontSize: "28px", lineHeight: 1 }}>⚡</div>
        <div style={{ color: "var(--bm-text, #e5e7eb)", fontWeight: 500, fontSize: "15px" }}>
          {feature} hit a snag
        </div>
        <div style={{ color: "var(--bm-text-muted, #9ca3af)", fontSize: "13px", maxWidth: "280px" }}>
          The AI pipeline ran into an issue. Your data is safe — this is usually transient.
        </div>
        <button
          onClick={this.handleRetry}
          style={{
            marginTop: "4px",
            padding: "8px 20px",
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: "8px",
            color: "#10b981",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.2)";
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.12)";
          }}
        >
          Try again
        </button>
        {process.env.NODE_ENV !== "production" && this.state.error && (
          <details style={{ marginTop: "8px", textAlign: "left", width: "100%" }}>
            <summary style={{ color: "#6b7280", fontSize: "11px", cursor: "pointer" }}>
              Dev: error details
            </summary>
            <pre style={{
              marginTop: "6px", fontSize: "10px", color: "#f87171",
              whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "120px", overflow: "auto",
            }}>
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

/**
 * withAIErrorBoundary — HOC for wrapping a component with an AIErrorBoundary.
 *
 * @example
 *   export default withAIErrorBoundary(CoachPanel, "AI Coach");
 */
export function withAIErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  feature: string,
): React.FC<P> {
  const displayName = WrappedComponent.displayName ?? WrappedComponent.name ?? "Component";

  const WithBoundary: React.FC<P> = (props) => (
    <AIErrorBoundary feature={feature}>
      <WrappedComponent {...props} />
    </AIErrorBoundary>
  );
  WithBoundary.displayName = `withAIErrorBoundary(${displayName})`;
  return WithBoundary;
}

export default AIErrorBoundary;
