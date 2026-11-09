"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProjectSummariesQuery } from "@/lib/queries";
import { getActiveProjectId } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Copy, Check, ExternalLink } from "lucide-react";

type Status = "saved" | "contacted" | "replied" | "converted" | "no_reply" | "not_a_fit";
type Channel = "whatsapp" | "facebook" | "phone" | "visit" | "email" | "other";
interface LeadRow {
  id: string | null; name: string; kind: string; where: string; url: string;
  why_fit: string; evidence: string; how_to_reach: string; first_message: string;
  status: Status; channel: Channel | null;
}

const KIND_LABEL: Record<string, string> = { business: "Business", public_community: "Public community", page: "Public page", association: "Association", event: "Event", listing: "Listing" };
const STATUS_LABEL: Record<Status, string> = { saved: "Not contacted", contacted: "Contacted", replied: "Replied", converted: "Became a customer", no_reply: "No reply", not_a_fit: "Not a fit" };
const CHANNELS: Array<[Channel, string]> = [["whatsapp", "WhatsApp"], ["facebook", "Facebook"], ["phone", "Phone"], ["visit", "In person"], ["email", "Email"], ["other", "Other"]];

const inputCls = "min-h-[44px] w-full rounded-lg border border-[var(--bm-border2)] bg-[var(--bm-bg2)] px-3 py-2 text-[14px] text-[var(--bm-text)] outline-none focus:border-[var(--bm-accent-bd)]";

export default function CustomersPage() {
  const { data: summaries = [] } = useProjectSummariesQuery();
  const [projectId, setProjectId] = useState("");
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
    if (project && !customer) setCustomer(project.target_users ?? "");
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  type RunInfo = { id: string; status: "running" | "done" | "failed"; lead_count: number; reason: string | null; error: string | null; stats?: { searches?: number; resultsFound?: number; pagesRead?: number; places?: number; proposed?: number } };
  const [run, setRun] = useState<RunInfo | null>(null);

  async function loadSaved(replace = false) {
    if (!project) return;
    const r = await fetch(`/api/leads?projectId=${project.id}&country=${encodeURIComponent(country)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return;
    setWorking(r.working ?? []);
    setRun(r.run ?? null);
    if (replace || !leads.length) {
      setLeads((r.leads ?? []).map((l: { id: string; lead_name: string; lead_kind: string; lead_url: string; payload: Partial<LeadRow>; status: Status; channel: Channel | null }) => ({
        id: l.id, name: l.lead_name, kind: l.lead_kind, url: l.lead_url, status: l.status, channel: l.channel,
        where: l.payload?.where ?? "", why_fit: l.payload?.why_fit ?? "", evidence: l.payload?.evidence ?? "",
        how_to_reach: l.payload?.how_to_reach ?? "", first_message: l.payload?.first_message ?? "",
      })));
    }
  }
  useEffect(() => { void loadSaved(); }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // While a search runs in the background, check on it every few seconds. It keeps running if you leave this page.
  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { void loadSaved(true); }, 4000);
    return () => clearInterval(t);
  }, [running, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (!project) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/leads/find", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, country, city, customer }),
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

  async function mark(l: LeadRow, status: Status, channel?: Channel | null) {
    if (!l.id) return;
    setLeads((all) => all.map((x) => (x.id === l.id ? { ...x, status, channel: channel ?? x.channel } : x)));
    await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, status, channel: channel ?? l.channel }) }).catch(() => {});
  }

  async function copy(l: LeadRow) {
    try { await navigator.clipboard.writeText(l.first_message); setCopied(l.url); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  const ready = country.trim().length >= 2 && customer.trim().length >= 3 && !busy && !running && !!project;

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Find customers" subtitle="Real businesses, pages and groups in your own area, with a first message for each." />

      {summaries.length === 0 ? (
        <p className="mt-6 text-[14px] text-[var(--bm-text3)]">Create a project first, then come back. <Link href="/projects/new" className="underline">New project</Link></p>
      ) : (
        <Card className="mt-5 p-4 sm:p-5">
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
          {summaries.length > 1 && (
            <label className="mt-3 block text-[13px] text-[var(--bm-text3)]">Project
              <select className={`${inputCls} mt-1`} value={project?.id ?? ""} onChange={(e) => { setProjectId(e.target.value); setLeads([]); setCustomer(""); }}>
                {summaries.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.title}</option>)}
              </select>
            </label>
          )}
          <Button className="mt-4 w-full sm:w-auto" disabled={!ready} onClick={() => void start()}>
            {busy || running ? <><Loader2 size={14} className="animate-spin" /> Searching…</> : "Find my first customers"}
          </Button>
          {running && <p className="mt-2 text-[13px] leading-relaxed text-[var(--bm-text2)]">Searching and reading real pages. This takes a few minutes. You can use other pages and come back; the results will be here.</p>}
          {error && <p role="alert" className="mt-3 text-[13px] text-[var(--bm-red)]">{error}</p>}
        </Card>
      )}

      {working.length > 0 && (
        <div className="mt-5 rounded-[12px] p-4" style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)" }}>
          <p className="text-[13px] font-semibold text-[var(--bm-text)]">What is working in {country || "your country"}</p>
          <ul className="mt-2 list-disc pl-5 text-[13px] leading-relaxed text-[var(--bm-text2)]">{working.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className="mt-2 text-[12px] text-[var(--bm-text3)]">From founders on BuildMind. No names or links are shared.</p>
        </div>
      )}

      {run?.status === "failed" && <p role="alert" className="mt-5 text-[13px] text-[var(--bm-red)]">{run.error ?? "The search failed."} Try again.</p>}
      {run?.status === "done" && run.reason && (
        <div className="mt-5">
          <p className="text-[13px] leading-relaxed text-[var(--bm-text2)]">{run.reason}</p>
          {run.stats && <p className="mt-1 text-[12px] text-[var(--bm-text3)]">Searches {run.stats.searches ?? 0}, results {run.stats.resultsFound ?? 0}, pages read {run.stats.pagesRead ?? 0}, map listings {run.stats.places ?? 0}, leads suggested {run.stats.proposed ?? 0}.</p>}
        </div>
      )}

      <ul className="mt-5 flex flex-col gap-3">
        {leads.map((l) => (
          <li key={l.id ?? l.url}>
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-[16px] font-semibold text-[var(--bm-text)]">{l.name}</h2>
                <span className="rounded-full bg-[var(--bm-bg3)] px-2 py-0.5 text-[11px] text-[var(--bm-text3)]">{KIND_LABEL[l.kind] ?? l.kind}</span>
              </div>
              {l.where && <p className="mt-1 text-[12px] text-[var(--bm-text3)]">{l.where}</p>}
              {l.why_fit && <p className="mt-3 text-[14px] leading-relaxed text-[var(--bm-text)]">{l.why_fit}</p>}
              {l.evidence && <p className="mt-2 break-words border-l-2 border-[var(--bm-border2)] pl-3 text-[13px] leading-relaxed text-[var(--bm-text3)]">{l.evidence}</p>}
              {l.how_to_reach && <p className="mt-2 text-[13px] text-[var(--bm-text2)]"><strong className="font-semibold">How to reach them:</strong> {l.how_to_reach}</p>}
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-[var(--bm-accent)] underline">
                Open the source <ExternalLink size={13} />
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
        ))}
      </ul>

      {leads.length > 0 && (
        <p className="mt-6 text-[12px] leading-relaxed text-[var(--bm-text3)]">
          Each place above came from a real page or map listing that was read during the search. Check it yourself before you contact anyone. Your results, without names or links, help other founders in your country once at least three founders have shared.
        </p>
      )}
    </div>
  );
}
