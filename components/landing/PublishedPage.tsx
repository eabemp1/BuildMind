import React from "react";
import type { CSSProperties } from "react";
import { onAccent, sectionsOf, type PageDesign } from "@/lib/landing/design";
import { InterestForm } from "@/app/i/[code]/InterestForm";

/**
 * The founder's published landing page. One component renders both the editor preview and the public link, so the
 * link looks like the preview. Sections appear only when the founder filled them; nothing is invented to fill space.
 */
export function PublishedPage({ headline, pitch, design: d, code, preview = false }: { headline: string; pitch: string; design: PageDesign; code: string; preview?: boolean }) {
  const s = sectionsOf(d);
  const vars = { "--accent": d.accent, "--on": onAccent(d.accent) } as CSSProperties;
  return (
    <div className="lp" style={vars}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="lp-head"><div className="lp-wrap">
        <a className="lp-brand" href="#top">
          {d.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.logo} alt="" className="lp-logo-img" /> : <span className="lp-mark" aria-hidden="true">{(d.brand || headline).charAt(0).toUpperCase()}</span>}
          {d.brand && <span>{d.brand}</span>}
        </a>
        <a className="lp-btn lp-sm" href="#join">{d.cta}</a>
      </div></header>

      <main id="top">
        <div className={`lp-hero${s.hero === "none" ? " lp-solo" : ""}`}><div className="lp-wrap lp-herogrid">
          <div>
            <h1>{headline}</h1>
            {pitch && <p className="lp-lede">{pitch}</p>}
            <a className="lp-btn" href="#join">{d.cta}</a>
            {d.whoFor && <p className="lp-note">{d.whoFor}</p>}
          </div>
          {s.hero === "screenshot" && (
            <div className="lp-shot">
              <div className="lp-bar"><i /><i /><i /></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.screenshot} alt={d.screenshotAlt || `Screenshot of ${d.brand || "the product"}`} />
            </div>
          )}
          {s.hero === "card" && (
            <div className="lp-card" aria-hidden="true">
              <b>{d.benefits[0].title}</b>
              <p>{d.benefits[0].text}</p>
              {d.benefits.length > 1 && <ul>{d.benefits.slice(1).map((b) => <li key={b.title}>{b.title}</li>)}</ul>}
            </div>
          )}
        </div></div>

        {s.benefits && (
          <section><div className="lp-wrap">
            <div className="lp-three">
              {d.benefits.map((b) => (<div className="lp-benefit" key={b.title}><h3>{b.title}</h3><p>{b.text}</p></div>))}
            </div>
          </div></section>
        )}

        {s.steps && (
          <section><div className="lp-wrap">
            <h2>How it works</h2>
            <ol className="lp-steps">
              {d.steps.map((x) => (<li key={x.title}><h3>{x.title}</h3><p>{x.text}</p></li>))}
            </ol>
          </div></section>
        )}

        {s.proof && (
          <section><div className="lp-wrap">
            <figure className="lp-proof"><blockquote>“{d.proofQuote}”</blockquote>{d.proofWho && <figcaption>{d.proofWho}</figcaption>}</figure>
          </div></section>
        )}

        <div className="lp-wrap"><div className="lp-final" id="join">
          <h2>{d.finalTitle || "Be one of the first to try it"}</h2>
          <p>{d.finalText || "Leave your email. We will ask you to confirm it, then you are on the list."}</p>
          <InterestForm code={code} preview={preview} label={d.cta} />
        </div></div>
      </main>
      <footer className="lp-foot"><div className="lp-wrap"><span>Your email goes only to the person who made this page. Made with BuildMind.</span></div></footer>
    </div>
  );
}

const CSS = `
.lp{--ink:#10231C;--muted:#4D5F57;--line:#D9E2DD;--bg:#F4F7F5;--card:#fff;--soft:color-mix(in srgb,var(--accent) 12%,#fff);
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  background:var(--bg);color:var(--ink);font:17px/1.6 var(--sans);-webkit-font-smoothing:antialiased;min-height:100vh}
@media (prefers-color-scheme:dark){.lp{--ink:#EAF3EE;--muted:#A5B8AE;--line:#27382F;--bg:#0D1612;--card:#13211B;--soft:color-mix(in srgb,var(--accent) 22%,#0D1612)}}
.lp *{box-sizing:border-box;margin:0}
.lp a{color:inherit}
.lp :focus-visible{outline:3px solid #F2B544;outline-offset:3px;border-radius:6px}
.lp-wrap{max-width:1240px;margin:0 auto;padding:0 24px}
.lp-head{padding:20px 0}.lp-head .lp-wrap{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lp-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:19px;text-decoration:none;min-width:0}
.lp-brand span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-mark{width:34px;height:34px;border-radius:10px;background:var(--accent);color:var(--on);display:grid;place-items:center;flex:none}
.lp-logo-img{height:34px;max-width:140px;object-fit:contain;flex:none}
.lp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 28px;border-radius:999px;background:var(--accent);color:var(--on)!important;font-weight:650;font-size:17px;text-decoration:none;border:0;cursor:pointer}
.lp-btn.lp-sm{min-height:42px;padding:0 20px;font-size:15px;flex:none}
.lp-hero{padding:28px 0 64px}
.lp-herogrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:48px;align-items:center}
.lp-solo .lp-herogrid{grid-template-columns:minmax(0,760px);justify-content:center}
.lp h1{font:600 clamp(38px,5.2vw,66px)/1.05 var(--serif);letter-spacing:-.025em;text-wrap:balance;overflow-wrap:anywhere}
.lp-lede{margin:20px 0 30px;font-size:20px;color:var(--muted);max-width:30em;overflow-wrap:anywhere}
.lp-note{margin-top:14px;font-size:14px;color:var(--muted)}
.lp-shot{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:0 30px 60px -30px rgba(16,35,28,.35);overflow:hidden}
.lp-bar{display:flex;gap:7px;padding:13px 16px;border-bottom:1px solid var(--line)}.lp-bar i{width:10px;height:10px;border-radius:50%;background:var(--line)}
.lp-shot img{display:block;width:100%;height:auto}
.lp-card{background:var(--accent);color:var(--on);border-radius:22px;padding:36px}
.lp-card b{display:block;font:600 34px/1.15 var(--serif);margin-bottom:12px;overflow-wrap:anywhere}
.lp-card p{margin:0 0 20px;opacity:.95;font-size:18px}
.lp-card ul{list-style:none;padding:0;display:grid;gap:10px}.lp-card li{padding-left:26px;position:relative;opacity:.95}
.lp-card li::before{content:"";position:absolute;left:4px;top:.55em;width:8px;height:8px;border-radius:50%;background:currentColor}
.lp section{padding:56px 0}
.lp h2{font:600 clamp(28px,3.4vw,42px)/1.12 var(--serif);letter-spacing:-.02em;text-wrap:balance;margin-bottom:28px;overflow-wrap:anywhere}
.lp-three{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.lp-benefit{background:var(--card);border:1px solid var(--line);border-top:4px solid var(--accent);border-radius:16px;padding:26px}
.lp h3{font:600 22px/1.25 var(--serif);margin-bottom:8px;overflow-wrap:anywhere}.lp-benefit p,.lp-steps p{color:var(--muted);font-size:16px;overflow-wrap:anywhere}
.lp-steps{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;counter-reset:s}
.lp-steps li{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px}
.lp-steps li::before{counter-increment:s;content:counter(s);display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--accent);color:var(--on);font-weight:700;margin-bottom:14px}
.lp-proof{max-width:720px;margin:0 auto;border-left:4px solid var(--accent);padding:4px 0 4px 24px}
.lp-proof blockquote{font:500 clamp(22px,2.6vw,30px)/1.35 var(--serif);overflow-wrap:anywhere}.lp-proof figcaption{margin-top:10px;color:var(--muted);font-size:15px}
.lp-final{background:var(--accent);color:var(--on);border-radius:26px;padding:52px 28px;text-align:center;margin:24px 0 48px}
.lp-final h2{margin:0 auto 12px;max-width:20em}.lp-final p{margin:0 auto 24px;opacity:.92;max-width:30em}
.lp-final form{max-width:460px;margin:0 auto;text-align:left}
.lp-foot{padding:0 0 36px;font-size:13px;color:var(--muted)}
@media (max-width:820px){
  .lp{font-size:16.5px}.lp-wrap{padding:0 20px}.lp-head{padding:14px 0}
  .lp-hero{padding:10px 0 40px}.lp-herogrid{grid-template-columns:1fr;gap:28px}
  .lp h1{font-size:38px}.lp-lede{font-size:18px;margin:14px 0 22px}
  .lp-hero .lp-btn{width:100%}.lp-head .lp-btn{display:none}
  .lp section{padding:36px 0}.lp-three,.lp-steps{grid-template-columns:1fr}
  .lp-card{padding:26px}.lp-card b{font-size:28px}
  .lp-final{padding:38px 20px;border-radius:22px}
}
@media (prefers-reduced-motion:reduce){.lp *{transition:none!important}}
`;
