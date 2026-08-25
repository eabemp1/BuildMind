"use client";

import { forwardRef, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  /** @deprecated Preserved for existing callers. Use variant instead. */
  gradient?: boolean;
  variant?: "default" | "data" | "insight" | "alert";
  as?: "div" | "article" | "section";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ hover = false, gradient = false, variant = "default", className = "", children, style, ...rest }, ref) => {
    const base = [
      "border bg-[var(--bm-bg2)] border-[var(--bm-border)] transition-colors duration-150",
      "rounded-[var(--r-lg)]",
      variant === "data" ? "bg-[var(--bm-bg3)]" : "",
      variant === "insight" ? "border-[var(--bm-intel-bd)]" : "",
      variant === "alert" ? "border-[var(--bm-accent-bd)]" : "",
      gradient ? "bg-gradient-to-br from-[var(--bm-bg2)] to-[var(--bm-bg3)]" : "",
      hover ? "cursor-pointer hover:border-[var(--bm-border2)]" : "",
      className,
    ].join(" ");

    return (
      <div ref={ref} className={base} style={style} {...rest}>
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export function CardHeader({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["px-4 py-3 border-b border-[var(--bm-border)]", className].join(" ")}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={["text-[13px] font-medium text-[var(--bm-text)]", className].join(" ")}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["px-4 py-4", className].join(" ")}
      {...props}
    />
  );
}
