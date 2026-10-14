"use client";

import React from "react";
import { Studio } from "./Studio";

/** /admin/distribution: the founder's private Distribution Studio. */
export default function DistributionPage() {
  return <Studio base="/api/admin/distribution" backHref="/admin/promoters" backLabel="Promoters" />;
}
