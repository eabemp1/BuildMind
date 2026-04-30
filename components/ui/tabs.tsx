"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  HTMLAttributes,
} from "react";
import { motion } from "framer-motion";

type TabsVariant = "underline" | "pill";

interface TabsContextValue {
  active: string;
  setActive: (val: string) => void;
  variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue>({
  active: "",
  setActive: () => {},
  variant: "pill",
});

// ── Root ──────────────────────────────────────────────────────────────────────

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (val: string) => void;
  variant?: TabsVariant;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue = "",
  value,
  onValueChange,
  variant = "pill",
  children,
  className = "",
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = value !== undefined;
  const active = controlled ? value! : internal;

  const setActive = (val: string) => {
    if (!controlled) setInternal(val);
    onValueChange?.(val);
  };

  return (
    <TabsContext.Provider value={{ active, setActive, variant }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function TabsList({ children, className = "", ...rest }: TabsListProps) {
  const { variant } = useContext(TabsContext);

  return (
    <div
      className={[
        "flex items-center",
        variant === "pill"
          ? "gap-1 p-1 rounded-lg bg-[var(--bm-bg3)] border border-[var(--bm-border)]"
          : "gap-0 border-b border-[var(--bm-border)]",
        className,
      ].join(" ")}
      role="tablist"
      {...rest}
    >
      {children}
    </div>
  );
}

// ── Trigger ───────────────────────────────────────────────────────────────────

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  children,
  className = "",
  disabled = false,
}: TabsTriggerProps) {
  const { active, setActive, variant } = useContext(TabsContext);
  const isActive = active === value;

  if (variant === "underline") {
    return (
      <button
        role="tab"
        aria-selected={isActive}
        disabled={disabled}
        onClick={() => setActive(value)}
        className={[
          "relative px-4 py-2.5 text-sm font-medium transition-colors duration-150",
          "focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
          isActive
            ? "text-[var(--bm-accent)]"
            : "text-[var(--bm-text3)] hover:text-[var(--bm-text2)]",
          className,
        ].join(" ")}
      >
        {children}
        {isActive && (
          <motion.div
            layoutId="tab-underline"
            className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
            style={{ background: "var(--bm-accent)" }}
            transition={{ duration: 0.2 }}
          />
        )}
      </button>
    );
  }

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActive(value)}
      className={[
        "relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150",
        "focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
        isActive
          ? "text-[var(--bm-text)]"
          : "text-[var(--bm-text3)] hover:text-[var(--bm-text2)]",
        className,
      ].join(" ")}
    >
      {isActive && (
        <motion.div
          layoutId="tab-pill"
          className="absolute inset-0 rounded-md bg-[var(--bm-bg2)] border border-[var(--bm-border2)]"
          transition={{ duration: 0.18 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({
  value,
  children,
  className = "",
}: TabsContentProps) {
  const { active } = useContext(TabsContext);
  if (active !== value) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      role="tabpanel"
      className={className}
    >
      {children}
    </motion.div>
  );
}
