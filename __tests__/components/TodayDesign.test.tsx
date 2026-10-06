import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { DecisionBrief } from "@/app/today/components/DecisionBrief";
import { DayRibbon } from "@/components/today/DayRibbon";

describe("DecisionBrief", () => {
  it("shows the task as the heading with the kind of work and the reason", () => {
    const html = renderToString(
      <DecisionBrief action="Message 3 founders on LinkedIn" rationale="You have not talked to a customer in 9 days." kicker="Talk to customers" time="25 minutes" reasons={["Nothing outbound this week"]} expectedEvidence="Three replies" />,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Message 3 founders on LinkedIn");
    expect(html).toContain("Talk to customers");
    expect(html).toContain("25 minutes");
    expect(html).toContain("You will know it worked when");
  });
  it("frames a low-confidence task as finding out, not guessing", () => {
    const html = renderToString(<DecisionBrief action="Ask 3 people" lowConfidence />);
    expect(html).toContain("Finding out first");
  });
});

describe("DayRibbon", () => {
  it("renders hour ticks and no text beyond them", () => {
    const html = renderToString(<DayRibbon now={new Date("2026-10-06T09:30:00")} color="#E8C547" dim="rgba(232,197,71,0.14)" done={false} running={false} />);
    expect(html).toContain("noon");
    expect(html).toContain('aria-hidden="true"');
  });
  it("draws the running block", () => {
    const html = renderToString(<DayRibbon now={new Date("2026-10-06T09:30:00")} color="#E8C547" dim="d" done={false} running focusSpan={{ startMin: 9 * 60 + 30, endMin: 9 * 60 + 55 }} />);
    expect(html).toContain("box-shadow");
  });
});
