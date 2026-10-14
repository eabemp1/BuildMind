"use client";

import { useEffect, useState } from "react";
import { PLAN_PRICE_MONTHLY, PLAN_PRICE_LABEL } from "@/lib/pricing";

export type ClientPrice = {
  monthlyUsd: number;
  label: string;
  standardLabel: string;
  regional: boolean;
};

const STANDARD: ClientPrice = {
  monthlyUsd: PLAN_PRICE_MONTHLY.builder,
  label: PLAN_PRICE_LABEL.builder,
  standardLabel: PLAN_PRICE_LABEL.builder,
  regional: false,
};

let cached: ClientPrice | null = null;
let inflight: Promise<ClientPrice> | null = null;

function load(): Promise<ClientPrice> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : STANDARD))
      .then((j) => {
        cached = {
          monthlyUsd: Number(j.monthlyUsd) || STANDARD.monthlyUsd,
          label: String(j.label || STANDARD.label),
          standardLabel: String(j.standardLabel || STANDARD.standardLabel),
          regional: Boolean(j.regional),
        };
        return cached;
      })
      .catch(() => STANDARD);
  }
  return inflight;
}

/** Standard price on first paint (matches SSR), regional price once known. */
export function usePricing(): ClientPrice {
  const [price, setPrice] = useState<ClientPrice>(cached ?? STANDARD);
  useEffect(() => {
    let live = true;
    load().then((p) => live && setPrice(p));
    return () => {
      live = false;
    };
  }, []);
  return price;
}
