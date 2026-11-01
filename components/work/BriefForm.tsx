"use client";
import React from "react";
import type { WorkSpec } from "@/lib/work/registry";
import { btn, input, label, muted } from "./ui";

type Project = { name: string; targetUsers: string; problem: string; description: string } | null;

const KEY = (id: string) => `bm_work_last_${id}`;

function initial(spec: WorkSpec, project: Project, given?: Record<string, string>): Record<string, string> {
  if (given && Object.keys(given).length) return given;
  let saved: Record<string, string> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY(spec.id)) ?? "{}"); } catch { /* storage unavailable */ }
  const v: Record<string, string> = {};
  for (const f of spec.fields) {
    v[f.key] = saved[f.key] ?? ((f.key === "audience" || f.key === "user") && project?.targetUsers ? project.targetUsers : "");
  }
  return v;
}

export default function BriefForm({ spec, project, given, busy, error, onSubmit, onBack }: {
  spec: WorkSpec; project: Project; given?: Record<string, string>; busy: boolean; error: string;
  onSubmit: (values: Record<string, string>) => void; onBack: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(() => initial(spec, project, given));
  const ready = spec.fields.every((f) => f.optional || (values[f.key] ?? "").trim().length > 0);

  function submit() {
    if (!ready || busy) return;
    try { localStorage.setItem(KEY(spec.id), JSON.stringify(values)); } catch { /* ignore */ }
    onSubmit(values);
  }

  return (
    <div className="wk-fade" style={{ display: "grid", gap: 18, maxWidth: 640 }}>
      <button type="button" className="wk-btn" onClick={onBack} style={{ ...btn(), width: "fit-content" }}>Back</button>
      <div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 4px" }}>{spec.label}</h2>
        <p style={{ ...muted, fontSize: 14 }}>{spec.blurb}</p>
      </div>
      <div style={{ display: "grid", gap: 16 }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}>
        {spec.fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`f-${f.key}`} style={label}>{f.label}{f.optional ? " (optional)" : ""}</label>
            {f.type === "long" ? (
              <textarea id={`f-${f.key}`} rows={3} maxLength={f.max} value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} style={{ ...input, resize: "vertical" }} />
            ) : f.type === "choice" ? (
              <select id={`f-${f.key}`} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} style={input}>
                <option value="">Choose</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input id={`f-${f.key}`} maxLength={f.max} value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} style={input} />
            )}
          </div>
        ))}
        {error && <p role="alert" style={{ ...muted, color: "var(--bm-red)" }}>{error}</p>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="wk-btn" disabled={!ready || busy} onClick={submit} style={{ ...btn(true), minHeight: 42, padding: "0 22px", opacity: !ready || busy ? 0.55 : 1 }}>{busy ? "Preparing…" : "Prepare"}</button>
          <span style={muted}>{busy ? "About 15 seconds." : "Unknowns are marked [add: ...]."}</span>
        </div>
      </div>
    </div>
  );
}
