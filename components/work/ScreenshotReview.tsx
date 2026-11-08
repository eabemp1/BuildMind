"use client";
import React from "react";
import { api, btn, card, input, label, muted } from "./ui";
import { MAX_IMAGES, type ScreenshotReview as Review } from "@/lib/work/screenshot";

/** Shrink in the browser first: a phone screenshot can be many MB, and the review only needs the layout and the words. */
async function shrink(file: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } catch { return null; }
}

export default function ScreenshotReview({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = React.useState<"landing" | "app">("landing");
  const [note, setNote] = React.useState("");
  const [images, setImages] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [upgrade, setUpgrade] = React.useState(false);
  const [review, setReview] = React.useState<Review | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
    setReview(null); setError("");
    if (!files.length) return;
    const data = await Promise.all(files.map(shrink));
    if (data.some((d) => !d)) { setError("One of those files could not be read as an image."); return; }
    setImages(data as string[]);
  }
  async function run() {
    if (!images.length || busy) return;
    setBusy(true); setError(""); setUpgrade(false);
    const r = await api<{ review: Review }>("/api/work/screenshot", { method: "POST", body: JSON.stringify({ images, kind, note }) });
    setBusy(false);
    if (!r.ok || !r.data?.review) { setError(r.error ?? "Could not review this. Please try again."); setUpgrade(Boolean(r.upgrade)); return; }
    setReview(r.data.review);
  }

  return (
    <div className="wk-fade" style={{ display: "grid", gap: 14 }}>
      <div><button type="button" className="wk-btn" onClick={onBack} style={btn()}>Back</button></div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--bm-text)" }}>Screenshot review</h2>
      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div>
          <span style={label}>What is it?</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="wk-btn" onClick={() => setKind("landing")} style={btn(false, kind === "landing")}>Landing page</button>
            <button type="button" className="wk-btn" onClick={() => setKind("app")} style={btn(false, kind === "app")}>App screen</button>
          </div>
        </div>
        <div>
          <label htmlFor="shot" style={label}>Screenshots (up to {MAX_IMAGES}, in order, top of the page first)</label>
          <input id="shot" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => void pick(e)} />
          {images.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {images.map((src, i) => <img key={i} src={src} alt={`Screenshot ${i + 1}, shrunk for upload`} style={{ maxWidth: 140, maxHeight: 200, borderRadius: 8, border: "1px solid var(--bm-border2)" }} />)}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="shot-note" style={label}>Anything it should know? (optional)</label>
          <input id="shot-note" style={input} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. This is for barbers who take bookings on WhatsApp" />
        </div>
        <button type="button" className="wk-btn" disabled={!images.length || busy} onClick={() => void run()} style={{ ...btn(true), width: "fit-content", opacity: !images.length || busy ? 0.6 : 1 }}>{busy ? "Reading…" : "Review it"}</button>
        {error && <p role="alert" style={{ ...muted, color: "var(--bm-red)" }}>{error}{upgrade ? " " : ""}{upgrade && <a href="/upgrade" style={{ color: "inherit" }}>See Builder</a>}</p>}
        <p style={muted}>The review is about what is visible in the image only. The picture is sent to an outside AI service to be read (Google Gemini, or Groq or OpenRouter if Gemini is busy). Free AI services may keep what they receive, so hide anything private first. BuildMind does not save it.</p>
      </div>
      {review && (
        <div style={{ ...card, display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--bm-text)", lineHeight: 1.55 }}>{review.summary}</p>
          {review.clear.length > 0 && (<div><span style={label}>Already working</span><ul style={{ margin: 0, paddingLeft: 18, color: "var(--bm-text2)", fontSize: 13.5, lineHeight: 1.6 }}>{review.clear.map((c) => <li key={c}>{c}</li>)}</ul></div>)}
          {review.problems.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <span style={label}>Fix first</span>
              {review.problems.map((p) => (
                <div key={p.what} style={{ border: "1px solid var(--bm-border2)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)" }}>{p.what}</div>
                  <div style={{ ...muted, marginTop: 4 }}>{p.why}</div>
                  <div style={{ fontSize: 13, color: "var(--bm-text2)", marginTop: 6 }}><strong>Fix:</strong> {p.fix}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
