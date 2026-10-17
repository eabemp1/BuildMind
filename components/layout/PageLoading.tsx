import React from "react";

/** Flat placeholder shown inside the shell while the next page's server work finishes. */
export default function PageLoading() {
  const bar = (w: string, h = 12) => (
    <div style={{ width: w, height: h, borderRadius: 6, background: "var(--border, rgba(128,128,128,0.18))", opacity: 0.6 }} />
  );
  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      {bar("38%", 18)}
      {bar("62%")}
      <div style={{ height: 8 }} />
      {bar("100%", 72)}
      {bar("100%", 72)}
    </div>
  );
}
