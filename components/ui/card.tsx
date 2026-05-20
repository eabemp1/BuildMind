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
    const base = [
      "rounded-[10px] border bg-[var(--bm-bg2)]",
      "border-[var(--bm-border)]",
      hover ? "cursor-pointer hover:border-[var(--bm-border2)]" : "",
      className,
    ].join(" ");

    if (hover) {
      return (
        <motion.div
          ref={ref}
          className={base}
          whileHover={{ borderColor: "var(--bm-border2)" }}
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
      className={["px-4 py-3 border-b border-[var(--bm-border)]", className].join(" ")}
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
      className={["px-4 py-4", className].join(" ")}
      {...props}
    />
  );
}
