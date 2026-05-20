"use client";

import { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "gradient"
  | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  success: {
    bg: "rgba(56,137,106,0.1)",
    text: "#38896A",
    border: "rgba(56,137,106,0.2)",
  },
  warning: {
    bg: "rgba(181,131,58,0.1)",
    text: "#B5833A",
    border: "rgba(181,131,58,0.2)",
  },
  danger: {
    bg: "rgba(176,72,72,0.1)",
    text: "#B04848",
    border: "rgba(176,72,72,0.2)",
  },
  neutral: {
    bg: "var(--bm-bg3)",
    text: "var(--bm-text3)",
    border: "var(--bm-border2)",
  },
  info: {
    bg: "var(--bm-accent-dim)",
    text: "var(--bm-accent)",
    border: "var(--bm-accent-bd)",
  },
  gradient: {
    bg: "var(--bm-accent-dim)",
    text: "var(--bm-accent)",
    border: "var(--bm-accent-bd)",
  },
};

export function Badge({
  variant = "neutral",
  size = "sm",
  dot = false,
  children,
  className = "",
  style,
  ...rest
}: BadgeProps) {
  const v = variantStyles[variant];
  const isGradient = variant === "gradient";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 border",
        "font-mono text-[10px] font-normal rounded px-[7px] py-[2px]",
        className,
      ].join(" ")}
      style={
        isGradient
          ? {
              background: v.bg,
              color: v.text,
              borderColor: v.border,
              borderRadius: "4px",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 400,
              letterSpacing: "0.02em",
              ...style,
            }
          : {
              background: v.bg,
              color: v.text,
              borderColor: v.border,
              borderRadius: "4px",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 400,
              letterSpacing: "0.02em",
              ...style,
            }
      }
      {...rest}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: v.text }}
        />
      )}
      {children}
    </span>
  );
}
