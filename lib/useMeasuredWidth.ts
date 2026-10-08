"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Width of an element in CSS px, kept current with a ResizeObserver.
 *
 * Inline SVG charts drawn with `viewBox` + `width="100%"` scale their text
 * with the container: a chart authored at 300 wide shows 9px labels at 2x
 * (18px) in a 600px card. Measuring the real width and drawing the chart in
 * those units keeps every label at its true pixel size on any screen.
 */
export function useMeasuredWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
