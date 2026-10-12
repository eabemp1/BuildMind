"use client";

import React from "react";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight, Check, Circle } from "lucide-react";
import { useProjectDetailQuery, useUpdateTaskMutation } from "@/lib/queries";
import type { OpenPane } from "@/components/layout/side-pane-context";

type ProjectReq = Extract<OpenPane, { kind: "project" }>;

/** Project (and optionally one task) beside the page. Tasks can be ticked off in place. */
export default function ProjectPane({ req }: { req: ProjectReq }) {
  const { data, isLoading, error } = useProjectDetailQuery(req.projectId);
  const update = useUpdateTaskMutation(req.projectId);
  const project = data?.project;
  const milestones = data?.milestones ?? [];
  const tasks = data?.tasks ?? [];

  const done = tasks.filter((t) => t.is_completed).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const byMilestone = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const k = t.milestone_id ?? "none";
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [tasks]);

  if (isLoading) return <p style={{ padding: 20, fontSize: 13, color: "var(--bm-text3)" }}>Loading project…</p>;
  if (error || !project) return <p style={{ padding: 20, fontSize: 13, color: "var(--bm-red)" }}>Could not load this project.</p>;

  const title = (project as { title?: string; name?: string }).title ?? (project as { name?: string }).name ?? req.title ?? "Project";
  const description = (project as { description?: string | null }).description;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "18px 20px 28px" }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: 20, color: "var(--bm-text)", letterSpacing: "-0.01em" }}>{title}</h2>
        {description && <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--bm-text3)" }}>{description}</p>}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--bm-text3)", marginBottom: 6 }}>
          <span>{done} of {tasks.length} tasks done</span><span style={{ fontFamily: "'DM Mono', monospace" }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: "var(--bm-bg4)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--bm-accent)", transition: "width .3s" }} />
        </div>
      </div>

      {[...milestones.map((m) => ({ id: m.id as string, title: m.title as string, is_completed: Boolean(m.is_completed) })), ...(byMilestone.has("none") ? [{ id: "none", title: "Other tasks", is_completed: false }] : [])].map((m) => {
        const list = byMilestone.get(m.id) ?? [];
        if (list.length === 0 && m.id === "none") return null;
        return (
          <section key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: m.is_completed ? "var(--bm-green)" : "var(--bm-text2)" }}>{m.title}</p>
            {list.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--bm-text4)" }}>No tasks yet.</p>}
            {list.map((t) => {
              const focus = req.taskId === t.id;
              return (
                <button key={t.id} type="button" disabled={update.isPending}
                  onClick={() => update.mutate({ taskId: t.id, isCompleted: !t.is_completed })}
                  aria-pressed={Boolean(t.is_completed)}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", background: focus ? "var(--bm-accent-dim)" : "var(--bm-bg3)", border: `1px solid ${focus ? "var(--bm-accent-bd)" : "var(--bm-border)"}`, borderRadius: 10, padding: "9px 11px", cursor: "pointer", color: "var(--bm-text)", fontFamily: "inherit" }}>
                  {t.is_completed ? <Check size={15} style={{ color: "var(--bm-green)", flexShrink: 0, marginTop: 2 }} /> : <Circle size={15} style={{ color: "var(--bm-text4)", flexShrink: 0, marginTop: 2 }} />}
                  <span style={{ fontSize: 13.5, lineHeight: 1.45, textDecoration: t.is_completed ? "line-through" : "none", opacity: t.is_completed ? 0.6 : 1, overflowWrap: "anywhere" }}>{t.title}</span>
                </button>
              );
            })}
          </section>
        );
      })}

      <Link href={`/projects/${req.projectId}`} style={{ alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--bm-accent)", textDecoration: "none" }}>
        Open full project <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
