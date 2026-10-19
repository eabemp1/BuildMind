/** Recognises a Loom or YouTube link so it can be checked through the provider's public oEmbed endpoint. */
export type VideoProvider = "loom" | "youtube";

export function parseVideoUrl(raw: string): { provider: VideoProvider; url: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "loom.com") {
    const m = /^\/(?:share|embed)\/([a-f0-9]{16,40})\/?$/i.exec(u.pathname);
    return m ? { provider: "loom", url: `https://www.loom.com/share/${m[1].toLowerCase()}` } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.pathname === "/watch" ? u.searchParams.get("v") : /^\/(?:shorts|embed)\/([\w-]{11})$/.exec(u.pathname)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? { provider: "youtube", url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? { provider: "youtube", url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  return null;
}

export const oembedUrl = (v: { provider: VideoProvider; url: string }) =>
  v.provider === "loom" ? `https://www.loom.com/v1/oembed?url=${encodeURIComponent(v.url)}` : `https://www.youtube.com/oembed?url=${encodeURIComponent(v.url)}&format=json`;
