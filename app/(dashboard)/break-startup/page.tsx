"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function BreakStartupRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/break-my-startup"); }, [router]);
  return null;
}
