import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { clampPaneWidth, PANE_MIN, PANE_MAX } from "@/components/layout/side-pane-context";
import { OpenBesideButton } from "@/components/layout/OpenBesideButton";
import ReaderPane from "@/components/layout/panes/ReaderPane";
import TodayCommandCenter from "@/components/today/TodayCommandCenter";

describe("side pane", () => {
  it("keeps the pane width inside its limits", () => {
    expect(clampPaneWidth(10)).toBe(PANE_MIN);
    expect(clampPaneWidth(5000)).toBe(PANE_MAX);
    expect(clampPaneWidth(500.4)).toBe(500);
  });

  it("opener buttons render outside the app shell without crashing", () => {
    const html = renderToString(<OpenBesideButton label="Read beside" request={{ kind: "coach" }} />);
    expect(html).toContain("Read beside");
  });

  it("reader pane shows the title, facts and body", () => {
    const html = renderToString(
      <ReaderPane req={{ kind: "reader", key: 1, eyebrow: "Why this task", title: "Message 3 founders", markdown: "You have not talked to a customer in 9 days.", facts: [{ label: "Time", value: "25 minutes" }] }} />,
    );
    expect(html).toContain("Message 3 founders");
    expect(html).toContain("Why this task");
    expect(html).toContain("25 minutes");
    expect(html).toContain("customer in 9 days");
  });
});

describe("Today hook", () => {
  it("shows the first move and the two ways to get unstuck", () => {
    const html = renderToString(
      <TodayCommandCenter actionTitle="Message 3 founders" action="Message 3 founders" timeText="25 minutes" done={false} streak={2} firstStep="Open LinkedIn and find 3 names" />,
    );
    expect(html).toContain("First move");
    expect(html).toContain("Open LinkedIn and find 3 names");
    expect(html).toContain("Why this");
    expect(html).toContain("Ask the coach");
  });

  it("hides the first move once the task is done", () => {
    const html = renderToString(<TodayCommandCenter actionTitle="x" action="x" timeText={null} done streak={0} firstStep="Open LinkedIn" />);
    expect(html).not.toContain("First move");
  });
});
