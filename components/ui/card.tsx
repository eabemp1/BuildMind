"use client";

import { forwardRef, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  gradient?: boolean;
  as?: "div" | "article" | "section";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ hover = false, gradient = false, className = "", children, style, ...rest }, ref) => {
    const base = [
      "border bg-[var(--bm-bg2)] border-[var(--bm-border)] transition-colors duration-150",
      "rounded-[var(--r-lg)]",
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
