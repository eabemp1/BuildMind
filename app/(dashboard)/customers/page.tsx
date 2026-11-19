"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProjectSummariesQuery } from "@/lib/queries";
import { getActiveProjectId } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Copy, Check, ExternalLink } from "lucide-react";
import { DemandCheck } from "@/components/customers/DemandCheck";

type Status = "saved" | "contacted" | "replied" | "converted" | "no_reply" | "not_a_fit";
type Channel = "whatsapp" | "facebook" | "phone" | "visit" | "email" | "other";
interface LeadRow {
  id: string | null; name: string; kind: string; where: string; url: string; location?: "confirmed" | "unconfirmed";
  why_fit: string; evidence: string; how_to_reach: string; first_message: string;
  tier?: "ready" | "no_contact" | "referral"; fit_proof?: string; already_has?: string; distinct_reason?: string; score?: number;
  status: Status; channel: Channel | null;
  country?: string; city?: string; created_at?: string;
}

// Results from different searches stay under their own heading: when it ran, and where it looked.
const searchKey = (l?: LeadRow) => (l ? `${(l.created_at ?? "").slice(0, 10)}|${l.country ?? ""}|${l.city ?? ""}` : "");
const searchLabel = (l: LeadRow) => {
  const when = l.created_at ? new Date(l.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  const where = [l.city, l.country].filter(Boolean).join(", ");
  return `Search${when ? ` on ${when}` : ""}${where ? ` · ${where}` : ""}`;
};

const KIND_LABEL: Record<string, string> = { business: "Business", public_community: "Public community", page: "Public page", association: "Association", event: "Event", listing: "Listing" };
const STATUS_LABEL: Record<Status, string> = { saved: "Not contacted", contacted: "Contacted", replied: "Replied", converted: "Became a customer", no_reply: "No reply", not_a_fit: "Not a fit" };
const CHANNELS: Array<[Channel, string]> = [["whatsapp", "WhatsApp"], ["facebook", "Facebook"], ["phone", "Phone"], ["visit", "In person"], ["email", "Email"], ["other", "Other"]];

const inputCls = "min-h-[44px] w-full rounded-lg border border-[var(--bm-border2)] bg-[var(--bm-bg2)] px-3 py-2 text-[14px] text-[var(--bm-text)] outline-none focus:border-[var(--bm-accent-bd)]";

export default function CustomersPage() {
  const { data: summaries = [], isLoading: summariesLoading } = useProjectSummariesQuery();
  const [projectId, setProjectId] = useState("");
  // A one-off product for this search only. Choosing it never changes the active project.
  const [oneoff, setOneoff] = useState<{ name: string; what: string } | null>(null);
  const [savedOneoffs, setSavedOneoffs] = useState<Array<{ name: string; what: string }>>([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [customer, setCustomer] = useState("");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [working, setWorking] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
    const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const id = getActiveProjectId();
    if (id) setProjectId(id);
  }, []);

  const project = useMemo(() => summaries.find((s) => s.id === projectId) ?? summaries[0], [summaries, projectId]);
  useEffect(() => {
    if (project && !oneoff && !customer) setCustomer(project.target_users ?? "");
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  // The product behind the search: the chosen project, or the one-off brief.
  const productName = oneoff ? oneoff.name.trim() : String(project?.name ?? project?.title ?? "");
  const productWhat = oneoff ? oneoff.what.trim() : String(project?.description ?? project?.problem ?? "");
  const hasProduct = oneoff ? oneoff.name.trim().length >= 2 : !!project;
  const scopeUrl = oneoff ? `scope=oneoff&brief=${encodeURIComponent(oneoff.name.trim())}` : project ? `projectId=${project.id}` : "";

  type RunInfo = { id: string; status: "running" | "done" | "failed"; lead_count: number; reason: string | null; error: string | null; retryable?: boolean; stats?: { searches?: number; resultsFound?: number; pagesRead?: number; places?: number; proposed?: number } };
  const [run, setRun] = useState<RunInfo | null>(null);

  async function loadSaved(replace = false) {
    if (!scopeUrl || !hasProduct) return;
    const r = await fetch(`/api/leads?${scopeUrl}&country=${encodeURIComponent(country)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return;
    if (Array.isArray(r.oneoffs)) setSavedOneoffs(r.oneoffs);
    setWorking(r.working ?? []);
    setRun(r.run ?? null);
    if (replace || !leads.length) {
      setLeads((r.leads ?? []).map((l: { id: string; lead_name: string; lead_kind: string; lead_url: string; payload: Partial<LeadRow>; status: Status; channel: Channel | null; country?: string; city?: string; created_at?: string }) => ({
        id: l.id, country: l.country, city: l.city, created_at: l.created_at, name: l.lead_name, kind: l.lead_kind, url: l.lead_url, status: l.status, channel: l.channel,
        where: l.payload?.where ?? "", location: l.payload?.location, why_fit: l.payload?.why_fit ?? "", evidence: l.payload?.evidence ?? "",
        how_to_reach: l.payload?.how_to_reach ?? "", first_message: l.payload?.first_message ?? "",
        tier: l.payload?.tier, fit_proof: l.payload?.fit_proof ?? "", already_has: l.payload?.already_has ?? "", distinct_reason: l.payload?.distinct_reason ?? "", score: l.payload?.score,
      })));
    }
  }
  const formKey = oneoff ? (oneoff.name.trim() ? `oneoff_${oneoff.name.trim().toLowerCase()}` : "") : (project?.id ?? "");
  // Keep the form across navigation: restore what was typed for this product.
  useEffect(() => {
    if (!formKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`bm_find_customers_${formKey}`) ?? "null") as { country?: string; city?: string; customer?: string } | null;
      if (saved) { if (saved.country) setCountry(saved.country.slice(0, 60)); if (saved.city) setCity(saved.city.slice(0, 60)); if (saved.customer) setCustomer(saved.customer.slice(0, 160)); }
    } catch { /* storage unavailable */ }
  }, [formKey]);
  useEffect(() => {
    if (!formKey || (!country && !city && !customer)) return;
    try { localStorage.setItem(`bm_find_customers_${formKey}`, JSON.stringify({ country, city, customer })); } catch { /* ignore */ }
  }, [formKey, country, city, customer]);
  useEffect(() => { void loadSaved(true); }, [formKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // While a search runs in the background, check on it every few seconds. It keeps running if you leave this page.
  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { void loadSaved(true); }, 4000);
    return () => clearInterval(t);
  }, [running, formKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(more = false) {
    if (!hasProduct) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/leads/find", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(oneoff ? { brief: { name: oneoff.name.trim(), what: oneoff.what.trim() } } : { projectId: project!.id }), country: country.trim(), city: city.trim(), customer: customer.trim(), more }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setError(json?.error ?? "Something went wrong. Try again."); return; }
      await loadSaved(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // The search already read its pages; this only asks the AI to write the leads again.
  async function retryWriting() {
    if (!run?.id) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/leads/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: run.id }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setError(json?.error ?? "Could not retry. Try again."); return; }
      await loadSaved(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function mark(l: LeadRow, status: Status, channel?: Channel | null) {
    if (!l.id) return;
    setLeads((all) => all.map((x) => (x.id === l.id ? { ...x, status, channel: channel ?? x.channel } : x)));
    await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, status, channel: channel ?? l.channel }) }).catch(() => {});
  }

  async function copy(l: LeadRow) {
    try { await navigator.clipboard.writeText(l.first_message); setCopied(l.url); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  const ready = country.trim().length >= 2 && customer.trim().length >= 3 && !busy && !running && hasProduct;

  // Group by search (date + place), newest first. Inside a search, leads not yet contacted come first.
  const groups: Array<{ key: string; leads: LeadRow[]; todo: number; referrals: LeadRow[] }> = [];
  for (const l of leads) {
    const key = searchKey(l);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, leads: [], todo: 0, referrals: [] }));
    // Directories and general groups are introductions, not leads: kept apart and out of the count.
    if (l.tier === "referral") { g.referrals.push(l); continue; }
    g.leads.push(l);
    if (l.status === "saved") g.todo++;
  }
  groups.sort((x, y) => y.key.localeCompare(x.key));
  for (const g of groups) g.leads.sort((x, y) => Number(y.status === "saved") - Number(x.status === "saved") || (y.score ?? 0) - (x.score ?? 0));

  const renderLead = (l: LeadRow) => (
          <li key={l.id ?? l.url}>
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-[16px] font-semibold text-[var(--bm-text)]">{l.name}</h2>
                <span className="rounded-full bg-[var(--bm-bg3)] px-2 py-0.5 text-[11px] text-[var(--bm-text3)]">{KIND_LABEL[l.kind] ?? l.kind}</span>
              </div>
              {l.where && <p className="mt-1 text-[12px] text-[var(--bm-text3)]">{l.where}</p>}
              {l.location === "unconfirmed" && <p className="mt-1 text-[12px] text-[var(--bm-text3)]">Location not confirmed on the page. Check it is in your area before you reach out.</p>}
              {l.why_fit && <p className="mt-3 text-[14px] leading-relaxed text-[var(--bm-text)]">{l.why_fit}</p>}
              {l.fit_proof && <p className="mt-2 break-words border-l-2 border-[var(--bm-border2)] pl-3 text-[13px] leading-relaxed text-[var(--bm-text2)]"><span className="font-semibold">On their page:</span> {l.fit_proof}</p>}
              {l.evidence && l.evidence !== l.fit_proof && <p className="mt-2 break-words border-l-2 border-[var(--bm-border2)] pl-3 text-[13px] leading-relaxed text-[var(--bm-text3)]">{l.evidence}</p>}
              {l.already_has && <p className="mt-2 text-[13px] text-[var(--bm-text2)]"><strong className="font-semibold">Already offers:</strong> {l.already_has}</p>}
              {l.distinct_reason && <p className="mt-2 text-[13px] text-[var(--bm-text2)]"><strong className="font-semibold">Why reach out:</strong> {l.distinct_reason}</p>}
              {l.how_to_reach && <p className="mt-2 text-[13px] text-[var(--bm-text2)]"><strong className="font-semibold">How to reach them:</strong> {l.how_to_reach}</p>}
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-[var(--bm-accent)] underline">
                {l.tier === "referral" ? "Open the page" : "Open the source that backs this up"} <ExternalLink size={13} />
              </a>

              {l.first_message && (
                <div className="mt-2 rounded-[10px] p-3.5" style={{ background: "var(--bm-bg3)" }}>
                  <p className="text-[12px] font-medium text-[var(--bm-text3)]">First message</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--bm-text)]">{l.first_message}</p>
                  <Button variant="secondary" size="sm" className="mt-3 min-h-[44px] w-full sm:w-auto" onClick={() => void copy(l)}>
                    {copied === l.url ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy message</>}
                  </Button>
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <label className="text-[12px] text-[var(--bm-text3)]">What happened?
                  <select className={`${inputCls} mt-1`} value={l.status} onChange={(e) => void mark(l, e.target.value as Status)}>
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <label className="text-[12px] text-[var(--bm-text3)]">How did you reach them?
                  <select className={`${inputCls} mt-1`} value={l.channel ?? ""} onChange={(e) => void mark(l, l.status, (e.target.value || null) as Channel | null)}>
                    <option value="">Not set</option>
                    {CHANNELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </label>
              </div>
            </Card>
          </li>
  );

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Find customers" subtitle="Real businesses, pages and groups in your own area, with a first message for each." />

      {summariesLoading && summaries.length === 0 ? (
        <p role="status" className="mt-6 text-[14px] text-[var(--bm-text3)]">Loading your projects…</p>
      ) : summaries.length === 0 ? (
        <p className="mt-6 text-[14px] text-[var(--bm-text3)]">Create a project first, then come back. <Link href="/projects/new" className="underline">New project</Link></p>
      ) : (
        <Card className="mt-5 p-4 sm:p-5">
          <div className="mb-4 rounded-[10px] p-3.5" style={{ background: "var(--bm-bg3)" }}>
            <p className="text-[13px] text-[var(--bm-text3)]">Searching for: <strong className="font-semibold text-[var(--bm-text)]">{productName || "a product you describe below"}</strong></p>
            {productWhat && <p className="mt-1 break-words text-[13px] leading-relaxed text-[var(--bm-text2)]">{productWhat.length > 160 ? `${productWhat.slice(0, 157)}...` : productWhat}</p>}
            <label className="mt-3 block text-[12px] text-[var(--bm-text3)]">Product
              <select
                className={`${inputCls} mt-1`}
                value={oneoff ? (savedOneoffs.some((o) => o.name.toLowerCase() === oneoff.name.trim().toLowerCase()) ? `o:${oneoff.name.trim().toLowerCase()}` : "new") : `p:${project?.id ?? ""}`}
                onChange={(e) => {
                  const v = e.target.value;
                  setLeads([]); setRun(null);
                  if (v === "new") { setOneoff({ name: "", what: "" }); setCustomer(""); return; }
                  if (v.startsWith("o:")) { const o = savedOneoffs.find((x) => x.name.toLowerCase() === v.slice(2)); if (o) { setOneoff({ name: o.name, what: o.what }); setCustomer(""); } return; }
                  setOneoff(null); setProjectId(v.slice(2)); setCustomer("");
                }}
              >
                {summaries.map((s2) => <option key={s2.id} value={`p:${s2.id}`}>{s2.name ?? s2.title}</option>)}
                {savedOneoffs.map((o) => <option key={o.name} value={`o:${o.name.toLowerCase()}`}>{o.name} (one-off)</option>)}
                <option value="new">A different product (one-off)…</option>
              </select>
            </label>
            {oneoff && (
              <div className="mt-3 grid gap-3">
                <label className="text-[12px] text-[var(--bm-text3)]">Product name
                  <input className={`${inputCls} mt-1`} value={oneoff.name} onChange={(e) => setOneoff({ ...oneoff, name: e.target.value })} placeholder="PLAYFORGE" maxLength={80} />
                </label>
                <label className="text-[12px] text-[var(--bm-text3)]">What it does, in one or two sentences
                  <textarea className={`${inputCls} mt-1 min-h-[72px]`} value={oneoff.what} onChange={(e) => setOneoff({ ...oneoff, what: e.target.value })} maxLength={400} placeholder="What it is and what problem it solves for your customers" />
                </label>
                <p className="text-[12px] text-[var(--bm-text3)]">This brief is used for this search only{project ? `. Your active project, ${String(project.name ?? project.title)}, is not changed` : ""}. It is saved with the results, so Find more keeps using it.</p>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] text-[var(--bm-text3)]">Country
              <input className={`${inputCls} mt-1`} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Ghana" maxLength={60} />
            </label>
            <label className="text-[13px] text-[var(--bm-text3)]">City or area (optional)
              <input className={`${inputCls} mt-1`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Accra" maxLength={60} />
            </label>
          </div>
          <label className="mt-3 block text-[13px] text-[var(--bm-text3)]">Who are your customers?
            <input className={`${inputCls} mt-1`} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Chop bar owners who track sales on paper" maxLength={160} />
          </label>
          <Button className="mt-4 w-full sm:w-auto" disabled={!ready} onClick={() => void start()}>
            {busy || running ? <><Loader2 size={14} className="animate-spin" /> Searching…</> : "Find my first customers"}
          </Button>
          {running && <p className="mt-2 text-[13px] leading-relaxed text-[var(--bm-text2)]">Searching and reading real pages. This takes a few minutes. You can use other pages and come back; the results will be here.</p>}
          {error && <p role="alert" className="mt-3 text-[13px] text-[var(--bm-red)]">{error}</p>}
        </Card>
      )}

      {project && !oneoff && (
        <div className="mt-5">
          <DemandCheck projectId={project.id} country={country} city={city} customer={customer} defaultProblem={String(project.problem ?? project.description ?? "").slice(0, 200)} />
        </div>
      )}

      {working.length > 0 && (
        <div className="mt-5 rounded-[12px] p-4" style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}>
          <p className="text-[13px] font-semibold text-[var(--bm-text)]">What is working in {country || "your country"}</p>
          <ul className="mt-2 list-disc pl-5 text-[13px] leading-relaxed text-[var(--bm-text2)]">{working.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className="mt-2 text-[12px] text-[var(--bm-text3)]">From founders on BuildMind. No names or links are shared.</p>
        </div>
      )}

      {run?.status === "failed" && run.retryable && (
        <div role="alert" className="mt-5 rounded-[12px] border border-[var(--bm-red)] p-4">
          <p className="text-[14px] font-semibold text-[var(--bm-text)]">Writing the leads failed</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--bm-text2)]">{run.error}</p>
          {run.stats && <p className="mt-1 text-[12px] text-[var(--bm-text3)]">The search itself worked: {run.stats.searches ?? 0} searches, {run.stats.pagesRead ?? 0} pages read, {run.stats.places ?? 0} map listings.</p>}
          <Button className="mt-3" disabled={busy} onClick={() => void retryWriting()} style={{ minHeight: 44 }}>{busy ? "Retrying…" : "Retry writing the leads"}</Button>
        </div>
      )}
      {run?.status === "failed" && !run.retryable && <p role="alert" className="mt-5 text-[13px] text-[var(--bm-red)]">{run.error ?? "The search failed."} Try again.</p>}
      {run?.status === "done" && run.reason && (
        <div className="mt-5">
          <p className="text-[13px] leading-relaxed text-[var(--bm-text2)]">{run.reason}</p>
          {run.stats && <p className="mt-1 text-[12px] text-[var(--bm-text3)]">Searches {run.stats.searches ?? 0}, results {run.stats.resultsFound ?? 0}, pages read {run.stats.pagesRead ?? 0}, map listings {run.stats.places ?? 0}, leads suggested {run.stats.proposed ?? 0}.</p>}
        </div>
      )}

      {hasProduct && groups.length > 0 && !running && (
        <div className="mt-5">
          <Button variant="secondary" disabled={busy || !ready} onClick={() => void start(true)} style={{ minHeight: 44 }}>{busy ? "Searching…" : run?.reason?.includes("ran out of time") ? "Continue the search that stopped early" : "Find more, skipping pages I already have"}</Button>
          <p className="mt-1 text-[12px] text-[var(--bm-text3)]">Uses the same product, place and customer. It skips the pages you already have and the searches already tried.</p>
        </div>
      )}

      {/* One section per search. The newest is open; older ones fold away so a long history stays short. */}
      <div className="mt-5 flex flex-col gap-4">
        {groups.map((g, gi) => (
          <details key={g.key} open={gi === 0} className="rounded-[12px] border border-[var(--bm-border)] p-3 sm:p-4">
            <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-[var(--bm-text)]">
              <span>{searchLabel(g.leads[0] ?? g.referrals[0])}</span>
              <span className="text-[12px] font-normal text-[var(--bm-text3)]">{g.leads.length} {g.leads.length === 1 ? "lead" : "leads"}{g.leads.length === 0 ? "" : g.todo > 0 ? `, ${g.todo} not contacted yet` : ", all followed up"}{g.referrals.length > 0 ? `, ${g.referrals.length} referral ${g.referrals.length === 1 ? "source" : "sources"}` : ""}</span>
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
        {g.leads.map(renderLead)}
            </ul>
            {g.referrals.length > 0 && (
              <details className="mt-4">
                <summary className="min-h-[44px] cursor-pointer text-[13px] font-semibold text-[var(--bm-text)]">Referral sources ({g.referrals.length})</summary>
                <p className="mt-1 text-[12px] text-[var(--bm-text3)]">Directories, lists and general groups. They are not leads. Ask them to introduce you to the right organiser.</p>
                <ul className="mt-3 flex flex-col gap-3">{g.referrals.map(renderLead)}</ul>
              </details>
            )}
            {g.leads.length === 0 && g.referrals.length > 0 && <p className="mt-3 text-[13px] text-[var(--bm-text2)]">No group with proof it fits and a way to reach it was found in this search.</p>}
          </details>
        ))}
      </div>

      {leads.length > 0 && (
        <p className="mt-6 text-[12px] leading-relaxed text-[var(--bm-text3)]">
          Each place above came from a real page or map listing that was read during the search. Check it yourself before you contact anyone. Your results, without names or links, help other founders in your country once at least three founders have shared.
        </p>
      )}
    </div>
  );
}
