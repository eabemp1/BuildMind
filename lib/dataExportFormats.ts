/**
 * lib/dataExportFormats.ts - the other ways to read an export: one table as CSV, and a readable report.
 * Pure. Takes the DataExport that lib/dataExport.ts built, so every format shows the same facts.
 */
import type { DataExport } from "@/lib/dataExport";

type Row = Record<string, unknown>;

const isScalar = (v: unknown) => v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v);

export interface CsvResult { csv: string; rows: number; columns: string[]; omitted: string[] }

/** Tables with at least one row and at least one flat column. */
export function csvTables(exp: DataExport): Array<{ table: string; label: string; rows: number }> {
  return exp.manifest
    .filter((m) => m.status === "exported" && (exp.tables[m.table] as Row[] | undefined)?.some((r) => Object.values(r).some(isScalar)))
    .map((m) => ({ table: m.table, label: m.label, rows: m.exported_rows }));
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // A spreadsheet runs text starting with = + - @ as a formula. A leading apostrophe keeps it as plain text.
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Flat columns only. Nested columns (lists and objects) are NOT squashed into text: they are named in `omitted`. */
export function toCsv(rows: Row[]): CsvResult {
  const cols: string[] = [];
  const omitted = new Set<string>();
  for (const r of rows) for (const [k, v] of Object.entries(r)) {
    if (isScalar(v)) { if (!cols.includes(k)) cols.push(k); } else omitted.add(k);
  }
  const keep = cols.filter((c) => !omitted.has(c) || rows.some((r) => isScalar(r[c]) && r[c] !== null && r[c] !== undefined));
  const lines = [keep.map(cell).join(","), ...rows.map((r) => keep.map((c) => cell(isScalar(r[c]) ? r[c] : "")).join(","))];
  return { csv: `﻿${lines.join("\r\n")}\r\n`, rows: rows.length, columns: keep, omitted: [...omitted].sort() };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const first = (r: Row, keys: string[]): string => { for (const k of keys) { const v = r[k]; if (typeof v === "string" && v.trim()) return v.trim(); } return ""; };
const when = (r: Row): string => { const v = first(r, ["created_at", "completed_at", "date", "started_at"]); return v ? v.slice(0, 10) : ""; };
const rowsOf = (exp: DataExport, t: string): Row[] => (exp.tables[t] as Row[] | undefined) ?? [];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function list(items: string[], empty: string): string {
  return items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<p class="muted">${esc(empty)}</p>`;
}

/**
 * A readable summary. Raw things the founder recorded and model-written interpretations are in separate
 * sections, and the second kind is labelled as interpretation, not fact.
 */
export function buildReportHtml(exp: DataExport): string {
  const projects = rowsOf(exp, "projects");
  const milestones = rowsOf(exp, "milestones");
  const tasks = rowsOf(exp, "tasks");
  const reflections = rowsOf(exp, "reflections");
  const memory = rowsOf(exp, "founder_memory");
  const findings = rowsOf(exp, "agent_findings");
  const log = rowsOf(exp, "reflexion_learning_log").filter((r) => r.prediction_source === "founder_intelligence");
  const briefings = rowsOf(exp, "morning_briefings");

  const done = tasks.filter((t) => /done|complete/i.test(String(t.status ?? ""))).length;
  const outcomes = log.reduce<Record<string, number>>((m, r) => { const o = String(r.outcome ?? "unknown"); m[o] = (m[o] ?? 0) + 1; return m; }, {});

  const manifestRows = exp.manifest.map((m) =>
    `<tr><td>${esc(m.label)}</td><td>${esc(m.status)}</td><td class="num">${m.exported_rows}</td><td>${esc(m.reason ?? "")}${m.contains_third_party_data ? " Contains other people's emails." : ""}</td></tr>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BuildMind founder data report</title>
<style>
body{font:15px/1.6 system-ui,sans-serif;color:#1c1c1e;max-width:760px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 8px}h3{font-size:15px;margin:20px 0 6px}
.muted{color:#6b6b72}.box{background:#f4f4f6;border-radius:10px;padding:14px 16px;margin:12px 0}.ai{background:#fff7e6}
table{border-collapse:collapse;width:100%;font-size:13.5px}td,th{text-align:left;padding:6px 8px;vertical-align:top}th{color:#6b6b72;font-weight:600}.num{text-align:right}
li{margin:4px 0}@media print{body{padding:0}}
</style></head><body>
<h1>Your BuildMind data</h1>
<p class="muted">Exported ${esc(exp.exported_at.slice(0, 10))} for ${esc(exp.email ?? exp.user_id)}. Data version ${esc(exp.schema_version)}.</p>
<div class="box"><strong>${exp.complete ? "This export is complete." : "This export is NOT complete."}</strong>
${exp.complete ? "Every category that exists in your account was read in full." : "Some categories failed or were cut short. See the table at the end."}</div>

<h2>What you recorded</h2>
<p class="muted">These sections are your own words and actions as BuildMind stored them.</p>
<h3>Projects</h3>
${list(projects.map((p) => `<strong>${esc(first(p, ["name", "title"]) || "Untitled")}</strong>${first(p, ["description"]) ? ` — ${esc(clip(first(p, ["description"]), 200))}` : ""}${first(p, ["startup_stage", "stage"]) ? ` <span class="muted">(${esc(first(p, ["startup_stage", "stage"]))})</span>` : ""}`), "No projects recorded.")}
<h3>Milestones</h3>
${list(milestones.slice(0, 30).map((m) => `${esc(first(m, ["title", "name"]) || "Milestone")} <span class="muted">${esc(first(m, ["status"]))}</span>`), "No milestones recorded.")}
<h3>Tasks</h3>
<p>${tasks.length} tasks recorded, ${done} marked done.</p>
${list(tasks.slice(0, 25).map((t) => `${esc(clip(first(t, ["title", "name"]) || "Task", 140))} <span class="muted">${esc(first(t, ["status"]))} ${esc(when(t))}</span>`), "No tasks recorded.")}
<h3>Reflections</h3>
${list(reflections.slice(0, 25).map((r) => `<span class="muted">${esc(when(r))} · ${esc(String(r.outcome ?? ""))}</span> — ${esc(clip(first(r, ["today_action", "note", "what_happened", "what_tried"]) || "(no text)", 220))}`), "No reflections recorded.")}

<h2>What BuildMind interpreted</h2>
<div class="box ai"><strong>Read this as interpretation, not fact.</strong> The items below were written or scored by an AI model from your data. They can be wrong or out of date.</div>
<h3>Recommendation outcomes</h3>
<p>${log.length ? Object.entries(outcomes).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ") : "No recommendation history."}</p>
<p class="muted">An outcome of “pending” means no result was recorded for that recommendation. It does not mean you ignored it.</p>
<h3>Agent crew findings</h3>
${list(findings.slice(0, 15).map((f) => `${esc(clip(first(f, ["title", "claim", "summary"]) || "Finding", 200))} <span class="muted">${esc(first(f, ["verification_status", "evidence_tier"]))}</span>`), "No findings.")}
<h3>Founder memory notes</h3>
${list(memory.slice(0, 8).map((m) => esc(clip(first(m, ["insight", "summary", "content", "memory"]) || JSON.stringify(m).slice(0, 200), 260))), "No memory notes.")}
<h3>Morning briefings</h3>
<p>${briefings.length} briefings generated. They are in the full JSON export.</p>

<h2>What is in this download</h2>
<table><thead><tr><th>Category</th><th>Status</th><th class="num">Rows</th><th>Notes</th></tr></thead><tbody>${manifestRows}</tbody></table>
<h3>Left out on purpose</h3>
${list(exp.excluded.map((e) => `<strong>${esc(e.table)}</strong>: ${esc(e.reason)}`), "Nothing.")}
<p class="muted">For every field of every record, use the JSON download.</p>
</body></html>`;
}
