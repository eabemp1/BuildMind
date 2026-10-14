"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Studio } from "@/app/admin/distribution/Studio";

/** A promoter's own Distribution Studio. Data is private to their link. */
export default function PromoterDistributionPage() {
  const { token } = useParams<{ token: string }>();
  return (
    <Studio
      base={`/api/promote/${token}/distribution`}
      backHref={`/promote/${token}`}
      backLabel="Back to my missions"
      subtitle="Your private workspace. Draft posts, track conversations and learn what works. It never posts or sends anything for you."
    />
  );
}
