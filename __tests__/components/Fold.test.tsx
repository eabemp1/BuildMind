import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import Fold from "@/components/today/Fold";

describe("Fold", () => {
  it("starts closed and hidden until its cards report content", () => {
    const html = renderToString(<Fold label="Also today" storageKey="k"><p>Reply check</p></Fold>);
    expect(html).toContain("Also today");
    expect(html).toContain('aria-expanded="false"');
    // outer wrapper hidden until the client confirms there is something to show; body stays mounted but closed
    expect(html).toContain("display:none");
    expect(html).toContain("Reply check");
  });
});
