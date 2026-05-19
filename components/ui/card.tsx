"use client";

import { forwardRef, HTMLAttributes } from "react";
import { motion, HTMLMotionProps } from "framer-motion";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  gradient?: boolean;
  as?: "div" | "article" | "section";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { hover = false, gradient = false, className = "", children, style, ...rest },
    ref
  ) => {
    const hasPadding = /\bp[trblxy]?-\d|\bp-\[/.test(className);
    const base = [
      "rounded-[18px] border",
      gradient
        ? "bg-gradient-to-br from-[var(--bm-bg2)] to-[var(--bm-bg3)]"
        : "bg-[var(--bm-bg2)]",
      "border-[var(--bm-border)]",
      hasPadding ? "" : "p-6",
      hover ? "card-hover cursor-pointer" : "",
      className,
    ].join(" ");

    if (hover) {
      return (
        <motion.div
          ref={ref}
          className={base}
          whileHover={{ y: -2, boxShadow: "0 8px 28px rgba(0,0,0,0.28)" }}
          transition={{ duration: 0.15 }}
          style={style}
          {...(rest as HTMLMotionProps<"div">)}
        >
          {children}
        </motion.div>
      );
    }

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
      className={["px-6 py-4 border-b border-[var(--bm-border)]", className].join(" ")}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={["text-base font-semibold text-[var(--bm-text)]", className].join(" ")}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["px-6 py-6", className].join(" ")}
      {...props}
    />
  );
}
