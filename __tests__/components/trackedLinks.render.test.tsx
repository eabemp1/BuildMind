import { describe, it, expect } from "vitest";
import React from "react";
(globalThis as { React?: unknown }).React = React; // the component relies on the automatic JSX runtime Next provides
import { renderToStaticMarkup } from "react-dom/server";
import TrackedLinks from "@/components/today/TrackedLinks";

describe("TrackedLinks (collapsed card)", () => {
  it("explains what it does in plain words and has one clear action", () => {
    const html = renderToStaticMarkup(<TrackedLinks projectId="p" />);
    expect(html).toContain("Count real responses instead of typing them");
    expect(html).toContain("BuildMind counts who actually opens it");
    expect(html).toContain("Set up a link");
  });
  it("changes its wording when the task is about reaching people", () => {
    const html = renderToStaticMarkup(<TrackedLinks nudge suggestedSource="x" />);
    expect(html).toContain("This task is about reaching people");
    expect(html).toContain("Make a link for this task");
  });
});
