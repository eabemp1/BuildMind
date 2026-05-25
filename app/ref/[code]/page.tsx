"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

/**
 * /ref/[code] — Referral landing page
 * Stores ref code in localStorage then redirects to signup.
 * e.g. buildmind.live/ref/abc12345 → /auth/login?ref=abc12345
 */
export default function RefPage() {
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  useEffect(() => {
    if (code) {
      try {
        // bm_ref_code is read on the login page before any user is authenticated —
        // intentionally raw localStorage (no user scope available yet).
        localStorage.setItem("bm_ref_code", code);
      } catch {}
    }
    router.replace(`/auth/login?ref=${code ?? ""}`);
  }, [code, router]);

  return (
    <div className="min-h-screen bm-bg flex items-center justify-center">
      <div className="text-sm bm-text3 animate-pulse">Redirecting…</div>
    </div>
  );
}
