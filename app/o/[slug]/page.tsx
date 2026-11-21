import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CTA_LABEL, type OfferContent } from "@/lib/offers/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

async function load(slug: string): Promise<OfferContent | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("offer_pages").select("content").eq("slug", slug).eq("status", "published").maybeSingle();
    if (!data) return null;
    await admin.rpc("bm_offer_count", { p_slug: slug, p_kind: "view" });
    return (data as { content: OfferContent }).content;
  } catch { return null; }
}

export default async function OfferPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) notFound();
  return (
    <main className="offer">
      <style>{`
        .offer{--bg:#fbfaf7;--fg:#1b1b1a;--muted:#5d5c58;--line:#dcd9d0;--accent:#1f4d3a;--accent-fg:#fff;background:var(--bg);color:var(--fg);min-height:100vh;padding:48px 16px;font:17px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
        @media (prefers-color-scheme:dark){.offer{--bg:#151513;--fg:#f1efe9;--muted:#aaa79e;--line:#34322d;--accent:#8fd0b0;--accent-fg:#102019}}
        .offer .wrap{max-width:640px;margin:0 auto}
        .offer h1{font-size:clamp(28px,6vw,40px);line-height:1.15;margin:0 0 12px;letter-spacing:-.01em}
        .offer .sub{color:var(--muted);margin:0 0 28px}
        .offer blockquote{margin:28px 0;padding:0 0 0 16px;border-left:3px solid var(--line);font-size:19px}
        .offer blockquote small{display:block;color:var(--muted);font-size:14px;margin-top:6px}
        .offer h2{font-size:15px;margin:32px 0 6px}
        .offer a.cta{display:inline-block;min-height:48px;line-height:48px;padding:0 24px;border-radius:8px;background:var(--accent);color:var(--accent-fg);font-weight:600;text-decoration:none;margin-top:20px}
        .offer a.cta:focus-visible{outline:3px solid var(--fg);outline-offset:2px}
        .offer footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
      `}</style>
      <div className="wrap">
        <h1>{c.headline}</h1>
        {c.subhead && <p className="sub">{c.subhead}</p>}
        <p>{c.offer}</p>
        {c.who_for && <p className="sub">For: {c.who_for}</p>}
        {c.quote && <blockquote>“{c.quote}”<small>What one person we talked to said</small></blockquote>}
        {c.faqs.map((f, i) => (<div key={i}><h2>{f.q}</h2><p>{f.a}</p></div>))}
        <a className="cta" href={`/o/${slug}/go`} rel="nofollow noopener">{CTA_LABEL[c.cta_kind]}</a>
        <footer>
          Written by an individual founder using BuildMind. BuildMind has not checked these claims and does not take payments on this page.
          Never enter a password or card number here. <a href={`mailto:hello@buildmind.live?subject=${encodeURIComponent(`Report offer page ${slug}`)}`} style={{ color: "inherit" }}>Report this page</a>
        </footer>
      </div>
    </main>
  );
}
