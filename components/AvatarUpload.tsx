"use client";

import { useRef, useState } from "react";

interface Props {
  currentUrl?: string | null;
  onUpload?: (url: string) => void;
}

export default function AvatarUpload({ currentUrl, onUpload }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("avatar", file);
    try {
      const res = await fetch("/api/user/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Upload failed");
      setPreview(data.url);
      onUpload?.(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ width: 56, height: 56, borderRadius: "50%", background: preview ? "transparent" : "var(--bm-bg3)", border: "1px solid var(--bm-border2)", cursor: uploading ? "not-allowed" : "pointer", overflow: "hidden", position: "relative", padding: 0, flexShrink: 0 }}
      >
        {preview ? <img src={preview} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18, color: "var(--bm-text3)" }}>U</span>}
        {uploading && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff" }}>...</div>}
      </button>
      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--bm-border2)", background: "var(--bm-bg3)", color: "var(--bm-text2)", fontSize: 12, fontWeight: 500, cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? "Uploading..." : "Upload photo"}
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
        <div style={{ fontSize: 10, color: "var(--bm-text4)", marginTop: 5 }}>JPG, PNG, WebP, GIF. Max 5 MB.</div>
        {error && <div style={{ fontSize: 11, color: "var(--bm-red)", marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  );
}
