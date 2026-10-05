import { describe, it, expect } from "vitest";
import { pickTaskDatabase, formatNotionContextForPrompt } from "@/lib/integrations/notion";
import { formatLinearContextForPrompt } from "@/lib/integrations/linear";

const db = (id: string, title: string, props: Record<string, string>, edited = new Date().toISOString()) => ({
  id, title: [{ plain_text: title }], last_edited_time: edited,
  properties: Object.fromEntries(Object.entries(props).map(([k, t]) => [k, { type: t }])),
});

describe("pickTaskDatabase", () => {
  it("prefers a task tracker over a wiki, regardless of search order", () => {
    const wiki = db("wiki", "Company Wiki", { Name: "title", Tags: "multi_select" });
    const crm = db("crm", "Contacts", { Name: "title", Stage: "select" });
    const tasks = db("tasks", "Founder Tasks", { Name: "title", Status: "status", Due: "date" });
    expect(pickTaskDatabase([wiki, crm, tasks])).toBe("tasks");
  });
  it("returns null when nothing looks like a task list", () => {
    expect(pickTaskDatabase([db("a", "Notes", { Name: "title" })])).toBeNull();
  });
  it("accepts a checkbox-only to-do list", () => {
    expect(pickTaskDatabase([db("todo", "To-do", { Name: "title", Done: "checkbox" })])).toBe("todo");
  });
});

describe("prompt formatting", () => {
  it("includes shipped work so it is not repeated", () => {
    const t = { id: "1", title: "Landing page", status: "Done", dueDate: null, url: "", done: true, editedAt: null };
    const txt = formatNotionContextForPrompt({ tasks: [], shipped: [t] });
    expect(txt).toMatch(/LAST 14 DAYS/);
    expect(txt).toContain("Landing page");
  });
  it("says nothing when empty or errored", () => {
    expect(formatNotionContextForPrompt({ tasks: [], shipped: [] })).toBe("");
    expect(formatLinearContextForPrompt({ issues: [], shipped: [], error: "x" })).toBe("");
  });
});
