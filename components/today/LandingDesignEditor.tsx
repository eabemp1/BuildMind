"use client";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublishedPage } from "@/components/landing/PublishedPage";
import { cleanAccent, type Item, type PageDesign } from "@/lib/landing/design";
import { pictureToDataUrl } from "@/lib/landing/image";

const muted: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--bm-text3)", lineHeight: "var(--leading-normal)", margin: 0 };
const label: React.CSSProperties = { ...muted, fontWeight: 700 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border2)", borderRadius: 8, padding: "8px 10px", color: "var(--bm-text)", fontSize: "var(--text-sm)", fontFamily: "inherit" };
const btn = (on = false): React.CSSProperties => ({ fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "6px 12px", border: `1px solid ${on ? "var(--bm-text)" : "var(--bm-border2)"}`, background: on ? "var(--bm-bg3)" : "transparent", color: "var(--bm-text2)" });

function Pic({ id, title, hint, value, side, onPick }: { id: string; title: string; hint: string; value: string; side: number; onPick: (url: string) => void }) {
  const [err, setErr] = React.useState("");
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={label} htmlFor={id}>{title}</label>
      <input id={id} type="file" accept="image/png,image/jpeg,image/webp" style={{ fontSize: "var(--text-xs)" }} onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const url = await pictureToDataUrl(f, side).catch(() => "");
        setErr(url ? "" : "Use a PNG, JPEG or WebP picture. This one could not be made small enough.");
        if (url) onPick(url);
        e.target.value = "";
      }} />
      <span style={muted}>{hint}</span>
      {value && <button type="button" style={{ ...btn(), width: "fit-content" }} onClick={() => onPick("")}>Remove</button>}
      {err && <span role="alert" style={muted}>{err}</span>}
    </div>
  );
}

function ItemsEditor({ title, items, onChange, addLabel }: { title: string; items: Item[]; onChange: (v: Item[]) => void; addLabel: string }) {
  const set = (i: number, patch: Partial<Item>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={label}>{title}</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gap: 4 }}>
          <input style={field} value={it.title} maxLength={60} placeholder="Short title" aria-label={`${title} ${i + 1} title`} onChange={(e) => set(i, { title: e.target.value })} />
          <textarea style={{ ...field, minHeight: 52 }} value={it.text} maxLength={200} placeholder="One or two sentences" aria-label={`${title} ${i + 1} text`} onChange={(e) => set(i, { text: e.target.value })} />
          <button type="button" style={{ ...btn(), width: "fit-content" }} onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {items.length < 3 && <button type="button" style={{ ...btn(), width: "fit-content" }} onClick={() => onChange([...items, { title: "", text: "" }])}>{addLabel}</button>}
    </div>
  );
}

/** Same component as the public page, shown in a frame of the real width so phone layouts apply for real. */
function Preview({ headline, pitch, design }: { headline: string; pitch: string; design: PageDesign }) {
  const [mode, setMode] = React.useState<"phone" | "desktop">("phone");
  const box = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(360);
  React.useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const html = React.useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}</style></head><body>${renderToStaticMarkup(<PublishedPage headline={headline || "Your headline"} pitch={pitch} design={design} code="preview" preview />)}</body></html>`, [headline, pitch, design]);
  const frameW = mode === "phone" ? 390 : 1280;
  const scale = Math.min(1, w / frameW);
  const frameH = mode === "phone" ? 720 : 800;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={label}>Preview</span>
        <button type="button" style={btn(mode === "phone")} aria-pressed={mode === "phone"} onClick={() => setMode("phone")}>Phone</button>
        <button type="button" style={btn(mode === "desktop")} aria-pressed={mode === "desktop"} onClick={() => setMode("desktop")}>Desktop</button>
      </div>
      <div ref={box} style={{ width: "100%", height: frameH * scale, overflow: "hidden", border: "1px solid var(--bm-border2)", borderRadius: 10 }}>
        <iframe title="Page preview" sandbox="" srcDoc={html} style={{ width: frameW, height: frameH, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", display: "block", margin: mode === "phone" && scale === 1 ? "0 auto" : 0 }} />
      </div>
    </div>
  );
}

export default function LandingDesignEditor({ headline, pitch, design, onChange, draft, projectId }: { headline: string; pitch: string; design: PageDesign; onChange: (d: PageDesign) => void; draft: string; projectId?: string | null }) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const up = (patch: Partial<PageDesign>) => onChange({ ...design, ...patch });

  async function draftSections() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/signal-links/design-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft, projectId: projectId ?? undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setMsg(j.error ?? "Could not draft the sections."); }
      else {
        const s = j.sections as Partial<PageDesign>;
        up({ benefits: s.benefits?.length ? s.benefits : design.benefits, steps: s.steps?.length ? s.steps : design.steps, whoFor: s.whoFor || design.whoFor, finalTitle: s.finalTitle || design.finalTitle, finalText: s.finalText || design.finalText });
        setMsg("Drafted from your copy. Anything that stated a number or claim you never gave was left out. Read it and edit.");
      }
    } catch { setMsg("Could not reach BuildMind. Try again."); }
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" style={btn()} disabled={busy} onClick={draftSections}>{busy ? "Drafting..." : "Draft the sections from my copy"}</button>
        <span style={muted}>Optional. You decide what stays.</span>
      </div>
      {msg && <p style={muted} role="status">{msg}</p>}

      <label style={label} htmlFor="lp-brand">Your product name</label>
      <input id="lp-brand" style={field} value={design.brand} maxLength={40} onChange={(e) => up({ brand: e.target.value })} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={label} htmlFor="lp-accent">Accent colour</label>
        <input id="lp-accent" type="color" value={design.accent} onChange={(e) => up({ accent: cleanAccent(e.target.value) })} aria-label="Accent colour" />
        <span style={muted}>{design.accent}</span>
      </div>
      <Pic id="lp-logo" title="Logo (optional)" hint="Shown top left. Without one, your initial is used." value={design.logo} side={400} onPick={(logo) => up({ logo })} />
      <Pic id="lp-shot" title="Product screenshot or demo picture (optional)" hint="Large, at the top of the page. Without one, the page shows your first benefit instead. Nothing is made up." value={design.screenshot} side={1600} onPick={(screenshot) => up({ screenshot })} />
      {design.screenshot && (<><label style={label} htmlFor="lp-alt">Describe the picture (for screen readers)</label><input id="lp-alt" style={field} value={design.screenshotAlt} maxLength={120} onChange={(e) => up({ screenshotAlt: e.target.value })} /></>)}
      <label style={label} htmlFor="lp-cta">Button text</label>
      <input id="lp-cta" style={field} value={design.cta} maxLength={30} onChange={(e) => up({ cta: e.target.value })} />
      <label style={label} htmlFor="lp-who">Who it is for (one line, optional)</label>
      <input id="lp-who" style={field} value={design.whoFor} maxLength={160} onChange={(e) => up({ whoFor: e.target.value })} />
      <ItemsEditor title="Benefits" items={design.benefits} onChange={(benefits) => up({ benefits })} addLabel="Add a benefit" />
      <ItemsEditor title="How it works" items={design.steps} onChange={(steps) => up({ steps })} addLabel="Add a step" />
      <label style={label} htmlFor="lp-quote">A real quote from a real customer (optional)</label>
      <textarea id="lp-quote" style={{ ...field, minHeight: 52 }} value={design.proofQuote} maxLength={300} onChange={(e) => up({ proofQuote: e.target.value })} />
      <input style={field} value={design.proofWho} maxLength={60} placeholder="Who said it, e.g. a clinic manager" aria-label="Who said the quote" onChange={(e) => up({ proofWho: e.target.value })} />
      <p style={muted}>Only add a quote someone actually said. With none, the page simply leaves that section out.</p>
      <label style={label} htmlFor="lp-ft">Closing headline (optional)</label>
      <input id="lp-ft" style={field} value={design.finalTitle} maxLength={70} onChange={(e) => up({ finalTitle: e.target.value })} />
      <Preview headline={headline} pitch={pitch} design={design} />
    </div>
  );
}
