import React from "react";
import { C, Panel } from "./ui";

type Founder = {
  label: string; project: string; stage: string | null; saidWhoFor: boolean; daysSince: number; finished: number;
  tasks: Array<{ task: string; outcome: string | null; curated: boolean }>;
};

/** The first tasks every recent signup was given, so a bad first task is seen before the founder leaves. */
export function NewFoundersCard() {
  const [rows, setRows] = React.useState<Founder[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    fetch("/api/admin/new-founders")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => live && setRows(j.founders ?? []))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  return (
    <Panel title="New founders: first tasks" right={rows ? <span style={{ fontSize: 11, color: C.t3 }}>{rows.length} in the last 7 days</span> : undefined}>
      {failed && <div style={{ fontSize: 12, color: C.t3 }}>Could not load new founders.</div>}
      {!failed && !rows && <div style={{ fontSize: 12, color: C.t3 }}>Loading…</div>}
      {rows && rows.length === 0 && <div style={{ fontSize: 12, color: C.t3 }}>No new founders in the last 7 days.</div>}
      {rows?.map((f) => (
        <div key={f.label} style={{ borderTop: `1px solid ${C.b}`, padding: "8px 0" }}>
          <div style={{ fontSize: 12, color: C.t, fontWeight: 600 }}>
            {f.label} · {f.project || "Unnamed"} · {f.stage ?? "no stage"} · day {f.daysSince}
          </div>
          <div style={{ fontSize: 11, color: f.saidWhoFor ? C.t3 : C.amber, marginBottom: 4 }}>
            {f.saidWhoFor ? "Said who they build for" : "Did not say who they build for"} · {f.finished} of {f.tasks.length} tasks finished
          </div>
          {f.tasks.length === 0 && <div style={{ fontSize: 11, color: C.t3 }}>No task shown yet.</div>}
          {f.tasks.map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: C.t2, overflowWrap: "anywhere", padding: "2px 0" }}>
              {i + 1}. {t.task} <span style={{ color: C.t4 }}>· {t.outcome ?? "pending"}{t.curated ? " · curated" : ""}</span>
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}
