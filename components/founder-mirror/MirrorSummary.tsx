"use client";
import { useEffect, useState } from "react";

/** A short plain-language reading of the Mirror. Quiet when it is unavailable: the rest of the page stands on its own. */
export default function MirrorSummary({ mirror }: { mirror: unknown }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/founder-context/mirror/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mirror }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.ok && typeof j.summary === "string") setText(j.summary); })
      .catch(() => {});
    return () => { alive = false; };
    // The mirror object is replaced on every load; the server caches by content, so one call per mount is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!text) return null;
  return (
    <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.6, color: "var(--bm-text2)", maxWidth: 680 }}>
      {text}
      <span style={{ display: "block", marginTop: 4, fontSize: 11.5, color: "var(--bm-text3)" }}>Written by AI from the observations below. It can be wrong.</span>
    </p>
  );
}
