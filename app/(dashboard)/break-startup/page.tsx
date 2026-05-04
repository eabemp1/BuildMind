"use client";
/**
 * app/(dashboard)/break-startup/page.tsx
 *
 * Legacy URL redirect — the canonical route is /break-my-startup.
 * This file must be kept to handle any old links/bookmarks.
 * Do NOT add logic here. Do NOT create a layout.tsx in this folder.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function BreakStartupRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/break-my-startup"); }, [router]);
  return null;
}
