"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/** Counts from the previous value to the new one once, so a changed number is noticed. */
export function useCountUp(value: number, duration = 0.9): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const controls = animate(shown, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration]);
  return shown;
}
