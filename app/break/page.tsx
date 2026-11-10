"use client";

/**
 * app/break/page.tsx — public "Break My Startup" page. No login needed.
 * The AI rates seven checks 0-5; the score is computed in lib/breakScore.ts from those ratings.
 * Styles live in break.module.css and use the app's own tokens, so this page matches the product.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/logo";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { BREAK_SEED_KEY, makeSeed } from "@/lib/break/frontDoor";
import { fallbackFirstTask, type FirstTask } from "@/lib/break/firstTask";
import { DIMENSIONS, DIMENSION_LABELS, DIMENSION_WEIGHTS } from "@/lib/breakScore";
import SampleOutputs from "@/components/break/SampleOutputs";
import css from "./break.module.css";

type Phase = "input" | "loading" | "result";

type BreakResult = {
  verdict: string;
  kill_reasons: string[];
  survive_reasons: string[];
  brutal_advice: string;
  survival_probability: number;
  differentiation_plan: string[];
  competitor_summary?: string;
  weakest?: { dimension?: string; label: string; test: string };
  signals?: Record<string, number>;
  first_task?: FirstTask;
  competitor_links?: { title: string; url: string }[];
};

const scoreWord = (n: number) => (n >= 60 ? "Promising" : n >= 35 ? "Uncertain" : "Likely to struggle");

function buildShareText(idea: string, result: BreakResult): string {
  return `I ran my startup idea through "Break My Startup" — an AI adversarial analysis.\n\nIdea: "${idea}"\n\nSurvival probability: ${result.survival_probability}%\n\nBiggest kill risk:\n→ ${result.kill_reasons[0]}\n\nBrutal advice:\n"${result.brutal_advice}"\n\nTry yours free → buildmind.live/break\n\n#buildinpublic #solofounder #startups`;
}

export default function BreakPublicPage() {
  const [phase, setPhase] = useState<Phase>("input");
  const [idea, setIdea] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<BreakResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [domain, setDomain] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");

  const handleScan = async () => {
    if (scanning || domain.trim().length < 4) return;
    setScanning(true); setScanNote(""); setError("");
    try {
      const res = await fetch("/api/ai/break-public/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: domain.trim() }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.success) throw new Error(b?.error ?? "Scan failed. Type it in instead.");
      setIdea(b.data.idea); setTargetUsers(b.data.targetUsers || ""); setProblem(b.data.problem || "");
      setScanNote(`Filled from ${b.data.domain}. Read it, fix anything wrong, then run it.`);
    } catch (e) { setScanNote(e instanceof Error ? e.message : "Scan failed. Type it in instead."); }
    finally { setScanning(false); }
  };

  // The landing page sends people here with their idea already typed.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("idea");
      if (q) setIdea(q.slice(0, 600));
    } catch { /* no window or bad URL */ }
  }, []);

  const canRun = idea.trim().length > 10;

  const handleRun = async () => {
    if (!canRun) return;
    setPhase("loading"); setError("");
    try {
      const res = await fetch("/api/ai/break-public", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ idea:idea.trim(), targetUsers:targetUsers.trim(), problem:problem.trim() }),
      });
      const body = await res.json().catch(()=>({}));
      if (!res.ok||!body.success) throw new Error(body?.error??"Analysis failed");
      setResult(body.data); setPreview(Boolean(body.preview)); setNeedsAccount(Boolean(body.needsAccount)); setPhase("result");
      // Signed-in runs are kept in the same history the logged-in Break page uses, so Market Watch knows who to watch.
      // Visitors without an account get a 401 here, which is fine: nothing is saved for them.
      try {
        const links = Array.isArray(body.data?.competitor_links) ? (body.data.competitor_links as Array<{ title?: string; url?: string }>) : [];
        void fetch("/api/break-runs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: idea.trim(), data: { ...body.data, agent_outputs: { competitor: { brief: links.map((l) => ({ name: l.title, url: l.url })) } } } }),
        }).catch(() => {});
      } catch { /* saving is best-effort */ }
      // Remember the advice so the first daily action in BuildMind can start from it.
      try { const seed = makeSeed(idea, String(body.data?.weakest?.test ?? body.data?.brutal_advice ?? "")); if (seed) localStorage.setItem(BREAK_SEED_KEY, JSON.stringify(seed)); } catch { /* private mode */ }
    } catch(err) {
      setError(err instanceof Error?err.message:"Something went wrong."); setPhase("input");
    }
  };

  const handleShare = (platform:"twitter"|"linkedin") => {
    if (!result) return;
    const text = buildShareText(idea, result);
    const url = platform==="twitter"
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://buildmind.live/break")}&summary=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(buildShareText(idea, result)).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 1500);
  };

  const handleReset = () => { setPreview(false); setPhase("input"); setResult(null); setIdea(""); setTargetUsers(""); setProblem(""); };

  const weakestKey = result?.weakest?.dimension;
  const hasSignals = !!result?.signals && DIMENSIONS.every((d) => typeof result.signals![d] === "number");

  return (
    <div className={css.page}>
      <div className={css.wrap}>
        <nav className={css.nav} aria-label="Main">
          <Link href="/" className={css.brand}><BrandMark size={24} href="" /> BuildMind</Link>
          <div className={css.navLinks}>
            <Link href="/auth/login">Sign in</Link>
            <Link href="/auth/login" className={`${css.btn} ${css.btnGhost}`} style={{ minHeight: 38, padding: "0 14px", fontSize: 14 }}>Create account</Link>
          </div>
        </nav>

        <main className={css.main}>
          {phase === "input" && (
            <>
              <h1 className={css.h1}>Find the weak spot in your startup idea</h1>
              <p className={css.lede}>Describe your idea in a few sentences. You get a score from seven checks, the check that is weakest, and one test to run this week.</p>

              <form className={css.form} onSubmit={(e) => { e.preventDefault(); void handleRun(); }}>
                <div className={css.field}>
                  <label htmlFor="break-idea">What are you building?</label>
                  <textarea id="break-idea" className={css.textarea} value={idea} onChange={(e) => setIdea(e.target.value)} rows={4}
                    placeholder="A booking app for independent barbers in Accra, who today take bookings by WhatsApp." />
                </div>
                <div className={css.row}>
                  <div className={css.field}>
                    <label htmlFor="break-users">Who is it for? <span className={css.hint}>Optional</span></label>
                    <input id="break-users" className={css.input} value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} placeholder="Independent barbers" />
                  </div>
                  <div className={css.field}>
                    <label htmlFor="break-problem">What problem does it solve? <span className={css.hint}>Optional</span></label>
                    <input id="break-problem" className={css.input} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Missed bookings and no-shows" />
                  </div>
                </div>
                <div className={css.field}>
                  <label htmlFor="break-domain">Already live? <span className={css.hint}>Fill the form from your website</span></label>
                  <div className={css.scan}>
                    <input id="break-domain" className={css.input} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourapp.com" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                    <button type="button" className={`${css.btn} ${css.btnGhost}`} onClick={handleScan} disabled={scanning || domain.trim().length < 4}>{scanning ? "Reading…" : "Read site"}</button>
                  </div>
                  {scanNote && <p role="status" className={css.small} style={{ margin: "8px 0 0" }}>{scanNote}</p>}
                </div>
                {error && <p role="alert" className={css.error}>{error}</p>}
                <div className={css.actions}>
                  <button type="submit" className={`${css.btn} ${css.btnPrimary}`} disabled={!canRun}>Run the test</button>
                  <span className={css.small}>Instant preview without an account. The full analysis, which also searches for competitors, needs a free account.</span>
                </div>
              </form>

              <section className={css.section} aria-labelledby="how">
                <h2 id="how" className={css.h2}>How the score is worked out</h2>
                <p className={css.muted}>An AI model reads what you wrote and rates each check from 0 to 5. The score is then calculated in code from fixed weights, so the same ratings always give the same number. The AI does not choose the score.</p>
                <ul className={css.checks}>
                  {DIMENSIONS.map((d) => (<li key={d}><span>{DIMENSION_LABELS[d]}</span><span>{Math.round(DIMENSION_WEIGHTS[d] * 100)}% of the score</span></li>))}
                </ul>
              </section>
              <section className={css.section}><SampleOutputs /></section>
            </>
          )}

          {phase === "loading" && (
            <div className={css.wait} role="status" aria-live="polite">
              <h1 className={css.h2}>Running the test</h1>
              <div className={css.bar} aria-hidden="true" />
              <p className={css.muted}>Reading your idea and searching for competitors. This usually takes 15 to 30 seconds.</p>
            </div>
          )}

          {phase === "result" && result && (
            <>
              {preview && (
                <p className={css.notice}>
                  {needsAccount
                    ? "This is a preview, scored from how your idea is written. The full analysis reads your competitors' sites and needs a free account."
                    : "This is a preview, scored from how your idea is written, because the live analysis is unavailable right now. Try again in a few minutes."}
                </p>
              )}

              <div className={css.score}>
                <div className={css.scoreNum} aria-label={`Survival score ${result.survival_probability} out of 100`}>{result.survival_probability}<small>%</small></div>
                <div>
                  <p className={css.scoreWord}>{scoreWord(result.survival_probability)}</p>
                  <p className={css.small} style={{ margin: 0 }}>Survival score</p>
                </div>
              </div>
              {!preview && <p className={css.verdict}>{sanitizeOutput(result.verdict)}</p>}

              {hasSignals && (
                <section className={css.section} aria-labelledby="checks">
                  <h2 id="checks" className={css.h2}>The seven checks</h2>
                  <p className={css.muted}>{preview ? "Estimated from the wording of your idea." : "Rated from what you wrote."} Your weakest check is highlighted.</p>
                  <ul className={css.bars}>
                    {DIMENSIONS.map((d) => {
                      const v = result.signals![d];
                      return (
                        <li key={d} className={d === weakestKey ? css.weakest : undefined}>
                          <span>{DIMENSION_LABELS[d]}</span>
                          <span className={css.track} role="img" aria-label={`${v} out of 5`}><span className={css.fill} style={{ display: "block", width: `${(v / 5) * 100}%` }} /></span>
                          <span className={css.val}>{v}/5</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {result.weakest && (
                <div className={css.callout}>
                  <h3>Test for your weakest check: {result.weakest.label}</h3>
                  <p>{sanitizeOutput(result.weakest.test)}</p>
                </div>
              )}

              {!preview && (
                <>
                  <section className={css.section}>
                    <h2 className={css.h2}>Next step</h2>
                    <p className={css.muted} style={{ color: "var(--bm-text)" }}>{sanitizeOutput(result.brutal_advice)}</p>
                  </section>

                  <section className={css.section}>
                    <h2 className={css.h2}>What could sink it</h2>
                    <ul className={css.list}>{result.kill_reasons.map((r, i) => <li key={i}>{sanitizeOutput(r)}</li>)}</ul>
                  </section>

                  {result.survive_reasons.length > 0 && (
                    <section className={css.section}>
                      <h2 className={css.h2}>What is in your favour</h2>
                      <ul className={css.list}>{result.survive_reasons.map((r, i) => <li key={i}>{sanitizeOutput(r)}</li>)}</ul>
                    </section>
                  )}

                  {!!result.competitor_links?.length && (
                    <section className={css.section}>
                      <h2 className={css.h2}>Already out there</h2>
                      <ul className={css.list}>{result.competitor_links.map((c) => (
                        <li key={c.url}><a href={c.url} target="_blank" rel="noopener noreferrer nofollow">{c.title}</a></li>
                      ))}</ul>
                    </section>
                  )}

                  {result.differentiation_plan?.length > 0 && (
                    <section className={css.section}>
                      <h2 className={css.h2}>How to stand out</h2>
                      <ul className={css.list}>{result.differentiation_plan.map((x, i) => <li key={i}>{sanitizeOutput(x)}</li>)}</ul>
                    </section>
                  )}
                </>
              )}

              {(() => {
                const ft = result.first_task ?? fallbackFirstTask();
                return (
                  <section className={css.section}>
                    <h2 className={css.h2}>Your first task</h2>
                    <p className={css.muted} style={{ color: "var(--bm-text)" }}>{sanitizeOutput(ft.task)}</p>
                    <p className={css.small} style={{ margin: "14px 0 0" }}>A message you could send to book a conversation:</p>
                    <p className={css.draft}>{ft.message}</p>
                  </section>
                );
              })()}

              <div className={css.section}>
                <div className={css.actions}>
                  <button type="button" className={`${css.btn} ${css.btnGhost}`} onClick={handleCopy}>{copied ? "Copied" : "Copy result"}</button>
                  <button type="button" className={`${css.btn} ${css.btnGhost}`} onClick={() => handleShare("linkedin")}>Share on LinkedIn</button>
                  <button type="button" className={`${css.btn} ${css.btnGhost}`} onClick={() => handleShare("twitter")}>Share on X</button>
                  <button type="button" className={`${css.btn} ${css.btnGhost}`} onClick={handleReset}>Test another idea</button>
                </div>
              </div>

              <div className={css.cta}>
                <h2 className={css.h2}>Keep going with this idea</h2>
                <p className={css.muted}>A free BuildMind account keeps this result, puts your first task on your Today page, and picks the next step each day.</p>
                <div className={css.actions} style={{ marginTop: 20 }}>
                  <Link href={`/auth/login?idea=${encodeURIComponent(idea.slice(0, 100))}`} className={`${css.btn} ${css.btnPrimary}`}>Create a free account</Link>
                  <Link href="/auth/login" className={css.link}>I already have one</Link>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
