"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The owner panel now lives in /admin as "Test tools", behind the same server-side admin gate in middleware. */
export default function OwnerRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin#owner"); }, [router]);
  return null;
}
