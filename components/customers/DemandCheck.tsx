"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Signal { quote: string; url: string; kind: "ask" | "complaint" | "workaround" | "wish"; theme: string; place: string }
interface Result { signals: Signal[]; themes: Array<{ name: string; count: number }>; headline: string }
interface Run { id: string; status: "running" | "done" | "failed"; result: Result | null; error: string | null }

const KIND: Record<Signal["kind"], string> = { ask: "Looking for it", complaint: "Unhappy with what exists", workaround: "Doing it by hand", wish: "Wishes it existed" };
const inputCls = "min-h-[44px] w-full rounded-lg border border-[var(--bm-border2)] bg-[var(--bm-bg2)] px-3 py-2 text-[14px] text-[var(--bm-text)] outline-none focus:border-[var(--bm-accent-bd)]";

interface Page { code: string; headline: string | null; path: string; signups: number; pending: number }

function SignupPage({ projectId, problem }: { projectId: string; problem: string }) {
  const [headline, setHeadline] = useState(`Get early access: ${problem}`.slice(0, 120));
  const [pitch, setPitch] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/signal-links", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setPages((r.links as Array<Page & { kind: string }>).filter((l) => l.kind === "interest"));
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/signal-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "interest", headline, pitch: pitch || undefined, projectId }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { setMsg(j?.error ?? "Could not create the page."); return; }
      setMsg("Page created. Share the link below."); await load();
    } catch { setMsg("Could not reach the server."); } finally { setBusy(false); }
  }
  async function copy(path: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setMsg("Link copied."); } catch { setMsg(`${window.location.origin}${path}`); }
  }

  return (
    <div className="mt-5 border-t border-[var(--bm-border)] pt-4">
      <h3 className="text-[15px] font-semibold text-[var(--bm-text)]">Turn this into a sign-up page</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--bm-text3)]">A simple page where people leave their email to hear when it is ready. Nobody is asked to pay. Share the link where you found these posts.</p>
      <label className="mt-3 block text-[13px] text-[var(--bm-text3)]">Headline
        <input className={`${inputCls} mt-1`} value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} />
      </label>
      <label className="mt-3 block text-[13px] text-[var(--bm-text3)]">One line about it (optional)
        <input className={`${inputCls} mt-1`} value={pitch} onChange={(e) => setPitch(e.target.value)} maxLength={300} />
      </label>
      <Button className="mt-3 w-full sm:w-auto" disabled={busy || headline.trim().length < 5} onClick={() => void create()}>{busy ? "Creating…" : "Create sign-up page"}</Button>
      {msg && <p className="mt-2 text-[13px] text-[var(--bm-text2)]">{msg}</p>}
      {pages.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {pages.map((p) => (
            <li key={p.code} className="flex flex-col gap-2 rounded-[10px] p-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--bm-bg3)" }}>
              <div className="min-w-0">
                <p className="break-words text-[14px] text-[var(--bm-text)]">{p.headline ?? "Sign-up page"}</p>
                <p className="text-[12px] text-[var(--bm-text3)]">{p.signups} {p.signups === 1 ? "sign-up" : "sign-ups"}{p.pending ? `, ${p.pending} not yet confirmed` : ""}</p>
              </div>
              <Button variant="secondary" size="sm" className="min-h-[44px] w-full sm:w-auto" onClick={() => void copy(p.path)}><Copy size={14} /> Copy link</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DemandCheck({ projectId, country, city, customer, defaultProblem }: { projectId: string; country: string; city: string; customer: string; defaultProblem: string }) {
  const [problem, setProblem] = useState(defaultProblem);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => { setProblem((p) => p || defaultProblem); }, [defaultProblem]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/demand?projectId=${projectId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setRun(r.run ?? null);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  async function start() {
    setStarting(true); setError("");
    try {
      const res = await fetch("/api/demand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, country, city, customer, problem }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setError(json?.error ?? "Something went wrong. Try again."); return; }
      await load();
    } catch { setError("Could not reach the server. Try again."); } finally { setStarting(false); }
  }

  const ready = country.trim().length >= 2 && customer.trim().length >= 3 && problem.trim().length >= 3 && !starting && !running;
  const result = run?.status === "done" ? run.result : null;

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-[16px] font-semibold text-[var(--bm-text)]">Do people here already want this?</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--bm-text3)]">I search public posts for people asking for this, complaining about it, or doing it by hand. Every quote is copied from a real page, with the link.</p>
      <label className="mt-3 block text-[13px] text-[var(--bm-text3)]">What do they need?
        <input className={`${inputCls} mt-1`} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Compare grocery prices across local stores" maxLength={240} />
      </label>
      <Button className="mt-4 w-full sm:w-auto" disabled={!ready} onClick={() => void start()}>
        {starting || running ? <><Loader2 size={14} className="animate-spin" /> Checking…</> : "Check demand"}
      </Button>
      {running && <p className="mt-2 text-[13px] leading-relaxed text-[var(--bm-text2)]">Reading public posts. This takes a few minutes. You can use other pages and come back.</p>}
      {error && <p role="alert" className="mt-3 text-[13px] text-[var(--bm-red)]">{error}</p>}
      {run?.status === "failed" && <p role="alert" className="mt-3 text-[13px] text-[var(--bm-red)]">{run.error ?? "The check failed."} Try again.</p>}

      {result && (
        <div className="mt-4">
          <p className="text-[14px] leading-relaxed text-[var(--bm-text)]">{result.headline}</p>
          {result.themes.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.themes.map((t) => <li key={t.name} className="rounded-full bg-[var(--bm-bg3)] px-3 py-1 text-[12px] text-[var(--bm-text2)]">{t.name} · {t.count}</li>)}
            </ul>
          )}
          <ul className="mt-4 flex flex-col gap-3">
            {result.signals.map((s) => (
              <li key={s.url + s.quote.slice(0, 20)} className="rounded-[10px] p-3.5" style={{ background: "var(--bm-bg3)" }}>
                <p className="text-[12px] font-medium text-[var(--bm-text3)]">{KIND[s.kind]}{s.place ? ` · ${s.place}` : ""}</p>
                <p className="mt-1 break-words text-[14px] leading-relaxed text-[var(--bm-text)]">&ldquo;{s.quote}&rdquo;</p>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-[var(--bm-accent)] underline">Open the post <ExternalLink size={13} /></a>
              </li>
            ))}
          </ul>
          <SignupPage projectId={projectId} problem={problem} />
        </div>
      )}
    </Card>
  );
}
