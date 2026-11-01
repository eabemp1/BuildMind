"use client";
import React from "react";
import { useActiveProjectId } from "@/lib/queries";
import { catalog, SPEC_BY_ID, EXISTING, type CatalogEntry } from "@/lib/work/registry";
import PreparedWork from "@/components/today/PreparedWork";
import Catalog from "./Catalog";
import BriefForm from "./BriefForm";
import ResultView, { type WorkItem } from "./ResultView";
import Library, { type LibraryRow } from "./Library";
import { api, btn, muted } from "./ui";

type Project = { name: string; targetUsers: string; problem: string; description: string } | null;
type View =
  | { name: "catalog" }
  | { name: "brief"; specId: string; given?: Record<string, string>; regenerateId?: string | null }
  | { name: "existing"; kind: string; task: string }
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
  const entries = React.useMemo(() => catalog(), []);

  const load = React.useCallback(async () => {
    const q = projectId ? `?projectId=${projectId}` : "";
    const r = await api<{ setup?: boolean; items?: LibraryRow[]; project?: Project }>(`/api/work/items${q}`);
    if (r.ok && r.data) { setRows(r.data.items ?? []); setSetup(!!r.data.setup); setProject(r.data.project ?? null); }
  }, [projectId]);
  React.useEffect(() => { void load(); }, [load]);

  function pick(e: CatalogEntry) {
    setError("");
    if (e.source === "existing") {
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
    setBusy(true); setError("");
    const r = await api<{ item: WorkItem }>("/api/work/generate", { method: "POST", body: JSON.stringify({ kind: specId, inputs: values, projectId, regenerateId: regenerateId ?? undefined }) });
    setBusy(false);
    if (!r.ok || !r.data?.item) { setError(r.error ?? "Could not prepare this. Please try again."); return false; }
    const it = r.data.item;
    setView({ name: "result", item: { ...it, edits: it.edits ?? {}, status: it.status ?? "draft", note: it.note ?? null } });
    void load();
    return true;
  }

  const back = () => { setView({ name: "catalog" }); setError(""); void load(); };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px 64px", display: "grid", gap: 18 }}>
      <header style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--bm-text)", margin: 0 }}>Work</h1>
        <p style={{ ...muted, fontSize: 14 }}>Pick the job. BuildMind prepares it from your project. You check it, change it, and do the sending yourself.</p>
      </header>
      {view.name === "catalog" && (
        <div role="tablist" style={{ display: "flex", gap: 6 }}>
          <button role="tab" aria-selected={tab === "new"} type="button" onClick={() => setTab("new")} style={btn(false, tab === "new")}>New</button>
          <button role="tab" aria-selected={tab === "library"} type="button" onClick={() => setTab("library")} style={btn(false, tab === "library")}>Library{rows.length ? ` (${rows.length})` : ""}</button>
        </div>
      )}
      {error && view.name === "catalog" && <p role="alert" style={{ ...muted, color: "var(--bm-red)" }}>{error}</p>}

      {view.name === "catalog" && tab === "new" && (
        <Catalog entries={entries} recent={rows.slice(0, 3).map((r) => ({ id: r.id, title: r.title, kind: r.kind }))} onPick={pick} onOpenItem={(id) => void openItem(id)} />
      )}
      {view.name === "catalog" && tab === "library" && <Library rows={rows} setup={setup} onOpen={(id) => void openItem(id)} />}

      {view.name === "brief" && SPEC_BY_ID[view.specId] && (
        <BriefForm spec={SPEC_BY_ID[view.specId]} project={project} given={view.given} busy={busy} error={error}
          onSubmit={(v) => void generate(view.specId, v, view.regenerateId)} onBack={back} />
      )}
      {view.name === "existing" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div><button type="button" onClick={back} style={btn()}>← All work</button></div>
          <PreparedWork task={view.task} projectId={projectId} />
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
