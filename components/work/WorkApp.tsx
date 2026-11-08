"use client";
import VoiceSample from "./VoiceSample";
import React from "react";
import { useActiveProjectId } from "@/lib/queries";
import { catalog, SPEC_BY_ID, EXISTING, VISUALS, TOOLS, type CatalogEntry } from "@/lib/work/registry";
import { LiveVisual } from "@/components/visuals/LiveVisual";
import PreparedWork from "@/components/today/PreparedWork";
import Catalog from "./Catalog";
import ScreenshotReview from "./ScreenshotReview";
import BriefForm from "./BriefForm";
import ResultView, { type WorkItem } from "./ResultView";
import Library, { type LibraryRow } from "./Library";
import Link from "next/link";
import { api, btn, muted, WORK_CSS } from "./ui";

type Project = { name: string; targetUsers: string; problem: string; description: string } | null;
type View =
  | { name: "catalog" }
  | { name: "brief"; specId: string; given?: Record<string, string>; regenerateId?: string | null }
  | { name: "existing"; kind: string; task: string; missionKind?: string | null; firstStep?: string; fromToday?: boolean }
  | { name: "visual"; kind: "stress" | "pmf" | "market" | "investor" }
  | { name: "tool"; kind: "screenshot" }
  | { name: "result"; item: WorkItem };

export default function WorkApp() {
  const projectId = useActiveProjectId();
  const [tab, setTab] = React.useState<"new" | "library">("new");
  const [view, setView] = React.useState<View>({ name: "catalog" });
  const [rows, setRows] = React.useState<LibraryRow[]>([]);
  const [setup, setSetup] = React.useState(false);
  const [project, setProject] = React.useState<Project>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [upgrade, setUpgrade] = React.useState(false);
  const entries = React.useMemo(() => catalog(), []);

  // Arriving from Today with the day's task: open its prepared work straight away.
  React.useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const task = (p.get("task") ?? "").slice(0, 400);
      if (task) setView({ name: "existing", kind: "", task, missionKind: p.get("mk") || null, firstStep: p.get("step")?.slice(0, 400) || undefined, fromToday: true });
      // A link such as /work?open=visual:market opens that drawn view straight away.
      const open = VISUALS.find((v) => v.id === p.get("open"));
      if (open && !task) setView({ name: "visual", kind: open.kind });
    } catch { /* no query string */ }
  }, []);

  const load = React.useCallback(async () => {
    const q = projectId ? `?projectId=${projectId}` : "";
    const r = await api<{ setup?: boolean; items?: LibraryRow[]; project?: Project }>(`/api/work/items${q}`);
    if (r.ok && r.data) { setRows(r.data.items ?? []); setSetup(!!r.data.setup); setProject(r.data.project ?? null); }
  }, [projectId]);
  React.useEffect(() => { void load(); }, [load]);

  function pick(e: CatalogEntry) {
    setError("");
    if (e.source === "tool") {
      const t = TOOLS.find((y) => y.id === e.id);
      if (t) setView({ name: "tool", kind: t.kind });
    } else if (e.source === "visual") {
      const v = VISUALS.find((y) => y.id === e.id);
      if (v) setView({ name: "visual", kind: v.kind });
    } else if (e.source === "existing") {
      const kind = e.id.replace("existing:", "");
      const x = EXISTING.find((y) => y.kind === kind);
      if (x) setView({ name: "existing", kind, task: x.task });
    } else setView({ name: "brief", specId: e.id });
  }
  async function openItem(id: string) {
    const r = await api<{ item: WorkItem }>(`/api/work/items?id=${id}`);
    if (!r.ok || !r.data?.item) { setError(r.error ?? "Could not open that."); return; }
    setTab("new"); setView({ name: "result", item: { ...r.data.item, id } });
  }
  async function generate(specId: string, values: Record<string, string>, regenerateId?: string | null) {
    setBusy(true); setError(""); setUpgrade(false);
    const r = await api<{ item: WorkItem }>("/api/work/generate", { method: "POST", body: JSON.stringify({ kind: specId, inputs: values, projectId, regenerateId: regenerateId ?? undefined }) });
    setBusy(false);
    if (!r.ok || !r.data?.item) { setError(r.error ?? "Could not prepare this. Please try again."); setUpgrade(Boolean(r.upgrade)); return false; }
    const it = r.data.item;
    setView({ name: "result", item: { ...it, edits: it.edits ?? {}, status: it.status ?? "draft", note: it.note ?? null } });
    void load();
    return true;
  }

  const back = () => {
    if (view.name === "existing" && view.fromToday) { try { window.history.replaceState(null, "", "/work"); } catch { /* ignore */ } }
    setView({ name: "catalog" }); setError(""); void load();
  };

  const home = view.name === "catalog";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 72px", display: "grid", gap: 20 }}>
      <style>{WORK_CSS}</style>
      {home && (
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--bm-text)", margin: 0 }}>Work</h1>
            <p style={{ ...muted, fontSize: 14, marginTop: 4 }}>Pick a job. Check the draft, then send it yourself.</p>
          </div>
          <div role="tablist" className="wk-tabs">
            <button role="tab" aria-selected={tab === "new"} type="button" className="wk-tab" onClick={() => setTab("new")}>New</button>
            <button role="tab" aria-selected={tab === "library"} type="button" className="wk-tab" onClick={() => setTab("library")}>Library{rows.length ? ` ${rows.length}` : ""}</button>
          </div>
        </header>
      )}
      {error && home && <p role="alert" style={{ ...muted, color: "var(--bm-red)" }}>{error}</p>}

      {home && tab === "new" && (
        <Link href="/work/conversations" className="wk-hero">
          <span style={{ display: "block", fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--bm-text)" }}>Get 5 customer conversations</span>
          <span style={{ display: "block", ...muted, fontSize: 13.5, marginTop: 4 }}>Add people, write to them, track replies.</span>
        </Link>
      )}
      {home && tab === "new" && (
        <Catalog entries={entries} recent={rows.slice(0, 3).map((r) => ({ id: r.id, title: r.title, kind: r.kind }))} onPick={pick} onOpenItem={(id) => void openItem(id)} />
      )}
      {home && tab === "new" && <VoiceSample />}
      {home && tab === "library" && <Library rows={rows} setup={setup} onOpen={(id) => void openItem(id)} />}

      {view.name === "brief" && SPEC_BY_ID[view.specId] && (
        <BriefForm spec={SPEC_BY_ID[view.specId]} project={project} given={view.given} busy={busy} error={error}
          onSubmit={(v) => void generate(view.specId, v, view.regenerateId)} onBack={back} />
      )}
      {view.name === "brief" && upgrade && <Link href="/upgrade" style={{ ...btn(true), textDecoration: "none", display: "inline-flex", alignItems: "center", width: "fit-content" }}>See Builder</Link>}
      {view.name === "existing" && (
        <div className="wk-fade" style={{ display: "grid", gap: 14 }}>
          <div><button type="button" className="wk-btn" onClick={back} style={btn()}>{view.fromToday ? "Back to Work" : "Back"}</button></div>
          {view.fromToday && <Link href="/today" style={{ ...muted, fontSize: 13, width: "fit-content" }}>Today's task: {view.task}</Link>}
          <PreparedWork task={view.task} missionKind={view.missionKind ?? null} firstStep={view.firstStep} projectId={projectId} />
        </div>
      )}
      {view.name === "tool" && view.kind === "screenshot" && <ScreenshotReview onBack={back} />}
      {view.name === "visual" && (
        <div className="wk-fade" style={{ display: "grid", gap: 14 }}>
          <div><button type="button" className="wk-btn" onClick={back} style={btn()}>Back</button></div>
          <LiveVisual kind={view.kind} projectId={projectId} />
          {!projectId && <p style={muted}>Open a project to see this.</p>}
        </div>
      )}
      {view.name === "result" && SPEC_BY_ID[view.item.kind] && (
        <ResultView item={view.item} spec={SPEC_BY_ID[view.item.kind]} regenerating={busy}
          onRegenerate={() => void generate(view.item.kind, view.item.inputs, view.item.id)}
          onEditBrief={() => setView({ name: "brief", specId: view.item.kind, given: view.item.inputs, regenerateId: view.item.id })}
          onBack={back} onDeleted={back} />
      )}
    </div>
  );
}
