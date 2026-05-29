"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/today";
  return value;
}

function ImplicitCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Finishing sign-in...");

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      const next = safeNextPath(searchParams.get("next"));
      const supabase = createClient();

      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const providerError = hash.get("error") ?? searchParams.get("error");
        if (providerError) {
          const reason = hash.get("error_description") ?? searchParams.get("error_description") ?? providerError;
          router.replace(`/auth/login?error=oauth_provider_failed&reason=${encodeURIComponent(reason)}`);
          return;
        }

        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!session) {
          throw new Error("Google sign-in returned without a browser session. Check Supabase and Google redirect URLs.");
        }

        await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
        if (!cancelled) router.replace(next);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Google sign-in could not finish.";
        if (!cancelled) {
          setMessage("Sign-in could not finish.");
          router.replace(`/auth/login?error=auth_callback_failed&reason=${encodeURIComponent(reason)}`);
        }
      }
    }

    void finishSignIn();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bm-bg, #0F0F10)",
        color: "var(--bm-text, #ECECEC)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p style={{ fontSize: 14, color: "var(--bm-text2, #9D9DA8)" }}>{message}</p>
    </main>
  );
}

export default function ImplicitCallbackPage() {
  return (
    <Suspense fallback={null}>
      <ImplicitCallbackContent />
    </Suspense>
  );
}
