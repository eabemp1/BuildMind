"use client";

import { forwardRef, ButtonHTMLAttributes } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "text-white border-transparent shadow-md hover:shadow-lg hover:opacity-90 active:opacity-100 active:scale-[0.98]",
  secondary:
    "bg-transparent text-[var(--bm-text)] border-[var(--bm-border2)] hover:bg-[var(--bm-bg3)] hover:border-[var(--bm-border3)] active:scale-[0.98]",
  ghost:
    "bg-transparent border-transparent text-[var(--bm-text2)] hover:bg-[var(--bm-bg3)] hover:text-[var(--bm-text)] active:scale-[0.98]",
  danger:
    "bg-transparent text-[var(--bm-red)] border-[rgba(224,85,85,0.25)] hover:bg-[rgba(224,85,85,0.08)] active:scale-[0.98]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      children,
      className = "",
      style,
      ...rest
    },
    ref
  ) => {
    const isPrimary = variant === "primary";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "relative inline-flex items-center justify-center font-medium border",
          "transition-all duration-150 select-none",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          fullWidth ? "w-full" : "",
          className,
        ].join(" ")}
        style={
          isPrimary
            ? {
                background: "var(--grad-primary)",
                ...style,
              }
            : style
        }
        {...rest}
      >
        {loading && (
          <Loader2
            className="animate-spin shrink-0"
            size={size === "sm" ? 12 : size === "lg" ? 18 : 14}
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
