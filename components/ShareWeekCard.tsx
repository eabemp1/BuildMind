"use client";

/**
 * components/ShareWeekCard.tsx
 *
 * Preview + share controls for the weekly card (/api/card/week). The image
 * is the server-rendered PNG, so what you preview is exactly what you post.
 * Share order of preference: native share sheet with the image attached
 * (phones), otherwise download + copy caption.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share2, Copy, Check } from "lucide-react";

type Format = "post" | "story" | "square";
type Theme = "ink" | "paper";

const FORMATS: Array<{ id: Format; label: string; ratio: string }> = [
  { id: "post", label: "Post", ratio: "4 / 5" },
  { id: "story", label: "Story", ratio: "9 / 16" },
  { id: "square", label: "Square", ratio: "1 / 1" },
];

const seg = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer",
  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
  background: active ? "var(--bm-bg5)" : "transparent",
  color: active ? "var(--bm-text)" : "var(--bm-text3)",
});

const btn: React.CSSProperties = {
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 14px",
  borderRadius: "var(--r-md, 10px)", border: "1px solid var(--bm-border2)", background: "var(--bm-bg3)",
  color: "var(--bm-text2)", fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

export function ShareWeekCard({ projectId }: { projectId?: string }) {
  const [format, setFormat] = useState<Format>("post");
  const [theme, setTheme] = useState<Theme>("ink");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [caption, setCaption] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qs = useCallback((extra = "") =>
    `/api/card/week?format=${format}&theme=${theme}${projectId ? `&projectId=${projectId}` : ""}${extra}`, [format, theme, projectId]);

  useEffect(() => { setLoaded(false); setFailed(false); }, [format, theme, projectId]);

  useEffect(() => {
    let live = true;
    fetch(qs("&caption=1")).then((r) => (r.ok ? r.text() : "")).then((t) => { if (live) setCaption(t); }).catch(() => {});
    return () => { live = false; };
  }, [qs]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = () => { setCopied(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800); };

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(caption); flash(); } catch { /* clipboard blocked */ }
  };

  const share = async () => {
    setBusy(true);
    try {
      const blob = await (await fetch(qs())).blob();
      const file = new File([blob], `buildmind-week-${format}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        await copyCaption();
      }
    } catch { /* user cancelled the share sheet */ }
    setBusy(false);
  };

  const ratio = FORMATS.find((f) => f.id === format)!.ratio;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>Share your week</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "var(--bm-text3)" }}>Real numbers from this week</span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div role="tablist" aria-label="Shape" style={{ display: "flex", flex: 2, padding: 3, borderRadius: 11, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
          {FORMATS.map((f) => <button key={f.id} role="tab" aria-selected={format === f.id} onClick={() => setFormat(f.id)} style={seg(format === f.id)}>{f.label}</button>)}
        </div>
        <div role="tablist" aria-label="Theme" style={{ display: "flex", flex: 1.2, padding: 3, borderRadius: 11, background: "var(--bm-bg3)", border: "1px solid var(--bm-border)" }}>
          <button role="tab" aria-selected={theme === "ink"} onClick={() => setTheme("ink")} style={seg(theme === "ink")}>Dark</button>
          <button role="tab" aria-selected={theme === "paper"} onClick={() => setTheme("paper")} style={seg(theme === "paper")}>Paper</button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", background: "var(--bm-bg)", borderRadius: 12, border: "1px solid var(--bm-border)", padding: 12 }}>
        <div style={{ position: "relative", width: format === "story" ? "52%" : format === "square" ? "78%" : "68%", minWidth: 200, aspectRatio: ratio, borderRadius: 8, overflow: "hidden", background: "var(--bm-bg3)" }}>
          {!loaded && !failed && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text3)" }}>Drawing your card…</div>}
          {failed && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text3)" }}>Couldn&apos;t draw the card. Try again in a moment.</div>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={qs()} src={qs()} alt="Your week as a BuildMind share card" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: loaded ? "block" : "none" }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={share} disabled={busy || failed} style={{ ...btn, background: "var(--bm-accent-dim)", borderColor: "var(--bm-accent-bd)", color: "var(--bm-accent)", opacity: busy ? 0.6 : 1 }}>
          <Share2 size={13} /> {busy ? "Preparing…" : "Share"}
        </button>
        <a href={qs("&download=1")} download={`buildmind-week-${format}-${theme}.png`} style={{ ...btn, textDecoration: "none" }}>
          <Download size={13} /> Download
        </a>
        <button onClick={copyCaption} disabled={!caption} style={btn}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy caption"}
        </button>
      </div>
    </div>
  );
}
