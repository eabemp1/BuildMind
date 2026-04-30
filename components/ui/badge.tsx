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
    bg: "rgba(92,200,138,0.10)",
    text: "var(--bm-green)",
    border: "rgba(92,200,138,0.22)",
  },
  warning: {
    bg: "rgba(232,160,32,0.10)",
    text: "var(--bm-amber)",
    border: "rgba(232,160,32,0.22)",
  },
  danger: {
    bg: "rgba(224,85,85,0.10)",
    text: "var(--bm-red)",
    border: "rgba(224,85,85,0.22)",
  },
  neutral: {
    bg: "var(--bm-bg3)",
    text: "var(--bm-text2)",
    border: "var(--bm-border2)",
  },
  info: {
    bg: "rgba(90,150,232,0.10)",
    text: "var(--bm-blue)",
    border: "rgba(90,150,232,0.22)",
  },
  gradient: {
    bg: "transparent",
    text: "white",
    border: "transparent",
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
        "inline-flex items-center gap-1 font-medium rounded-full border",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        className,
      ].join(" ")}
      style={
        isGradient
          ? {
              background: "var(--grad-primary)",
              border: "none",
              letterSpacing: "0.04em",
              ...style,
            }
          : {
              background: v.bg,
              color: v.text,
              borderColor: v.border,
              letterSpacing: "0.04em",
              ...style,
            }
      }
      {...rest}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: isGradient ? "white" : v.text }}
        />
      )}
      {children}
    </span>
  );
}
