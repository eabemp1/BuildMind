"use client";

import React, { useMemo, useState } from "react";
import { VisualBoard } from "@/components/visuals/VisualBoard";
import { OpenBesideButton } from "@/components/layout/OpenBesideButton";
import { buildMirrorVisual, type MirrorLite } from "@/lib/visuals/mirrorVisual";

/** Collapsible drawn view of the mirror; own state so it is safe below early returns. */
export function MirrorDrawn({ mirror }: { mirror: MirrorLite }) {
  const [open, setOpen] = useState(false);
  const spec = useMemo(() => buildMirrorVisual(mirror), [mirror]);
  return (
    <section className="mt-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="cursor-pointer rounded-[10px] border border-[var(--bm-border2)] bg-[var(--bm-bg2)] px-3.5 py-2 text-[13px] font-semibold text-[var(--bm-text)]">
          {open ? "Hide" : "Draw"} my mirror
        </button>
        {open && <OpenBesideButton label="Discuss beside" request={{ kind: "coach", title: "Coach", prompt: "What do you believe about me" }} />}
      </div>
      {open && <div className="mt-3"><VisualBoard spec={spec} showHeader={false} /></div>}
    </section>
  );
}
