"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";

type ReflectionFieldProps = {
  label: string;
  required?: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

/** Presentation-only field; the reflect route owns submission and learning state. */
export function ReflectionField({ label, required = false, placeholder, value, onChange }: ReflectionFieldProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <Card variant="data" className="mb-3 rounded-[var(--r-xl)] p-4 sm:px-5">
        <label className="mb-2.5 block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--bm-text3)]">
          {label}{required ? <span className="ml-1 text-[var(--bm-accent)]">*</span> : null}
        </label>
        <Textarea
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={2}
          className="bg-[var(--bm-bg2)] text-[13px] leading-relaxed"
        />
      </Card>
    </motion.div>
  );
}
