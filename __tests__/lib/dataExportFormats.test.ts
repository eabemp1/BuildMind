import { describe, it, expect } from "vitest";
import { toCsv, csvTables, buildReportHtml } from "@/lib/dataExportFormats";
import { buildDataExport } from "@/lib/dataExport";

describe("toCsv", () => {
  it("writes flat columns, escapes quotes and commas, and names nested columns instead of flattening them", () => {
    const r = toCsv([{ id: 1, title: 'Say "hi", ok', meta: { a: 1 }, tags: ["x"] }, { id: 2, title: "plain", meta: null }]);
    expect(r.omitted).toEqual(["meta", "tags"].filter((c) => c !== "meta" || true).sort());
    expect(r.columns).toEqual(["id", "title"]);
    expect(r.csv).toContain('1,"Say ""hi"", ok"');
    expect(r.csv).not.toContain("[object Object]");
    expect(r.csv.startsWith("﻿")).toBe(true);
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([{ a: "=SUM(A1:A9)" }, { a: "+1" }, { a: "ok" }]).csv).toContain("'=SUM(A1:A9)");
  });
});

function adminWith(tables: Record<string, unknown[]>) {
  return { from: (t: string) => { const c: any = { select: () => c, eq: () => c, order: () => c, range: async () => ({ data: tables[t] ?? [], error: null, count: (tables[t] ?? []).length }) }; return c; } } as any;
}

describe("csvTables and report", () => {
  it("offers only tables that have rows with flat columns", async () => {
    const exp = await buildDataExport(adminWith({ tasks: [{ id: 1, title: "A" }], milestones: [], projects: [{ nested: { a: 1 } }] }), { id: "u" });
    expect(csvTables(exp).map((t) => t.table)).toEqual(["tasks"]);
  });
  it("builds a report that separates what was recorded from AI interpretation, states completeness and escapes HTML", async () => {
    const exp = await buildDataExport(adminWith({
      projects: [{ name: "<script>alert(1)</script>Acme", description: "Sell <b>stuff</b>" }],
      tasks: [{ title: "Ship it", status: "done" }, { title: "Test it", status: "todo" }],
      agent_findings: [{ title: "Competitors charge $9", verification_status: "founder_verified" }],
      reflexion_learning_log: [{ prediction_source: "founder_intelligence", outcome: "pending" }, { prediction_source: "founder_intelligence", outcome: "completed" }],
    }), { id: "u", email: "a@b.c" });
    const html = buildReportHtml(exp);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html.indexOf("What you recorded")).toBeLessThan(html.indexOf("What BuildMind interpreted"));
    expect(html).toContain("interpretation, not fact");
    expect(html).toContain("2 tasks recorded, 1 marked done");
    expect(html).toContain("does not mean you ignored it");
    expect(html).toContain("This export is complete.");
    expect(html).toContain("Left out on purpose");
  });
  it("says plainly when the export is not complete", async () => {
    const bad: any = { from: () => { const c: any = { select: () => c, eq: () => c, order: () => c, range: async () => ({ data: null, error: { code: "XX" }, count: null }) }; return c; } };
    expect(buildReportHtml(await buildDataExport(bad, { id: "u" }))).toContain("This export is NOT complete.");
  });
});
