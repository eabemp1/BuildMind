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
          const reason =
            hash.get("error_description") ??
            searchParams.get("error_description") ??
            providerError;
          if (!cancelled) {
            router.replace(
              `/auth/login?error=oauth_provider_failed&reason=${encodeURIComponent(reason)}`,
            );
          }
          return;
        }

        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            const { data: { session: existingSession } } = await supabase.auth.getSession();
            if (!existingSession) {
              throw new Error(
                `Code exchange failed: ${error.message}. ` +
                `Check that your Supabase redirect URLs include ` +
                `${window.location.origin}/auth/implicit-callback`,
              );
            }
          }
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${searchParams.get("next") ? `?next=${searchParams.get("next")}` : ""}`,
          );
          await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
          if (!cancelled) router.replace(next);
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
          await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
          if (!cancelled) router.replace(next);
          return;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session) {
          await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
          if (!cancelled) router.replace(next);
          return;
        }

        throw new Error(
          "Google sign-in did not return a code or token. " +
          "Check that your Supabase project has " +
          `${window.location.origin}/auth/implicit-callback ` +
          "listed under Authentication > URL Configuration > Redirect URLs.",
        );
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Google sign-in could not finish.";
        if (!cancelled) {
          setMessage("Sign-in could not finish — redirecting...");
          router.replace(
            `/auth/login?error=auth_callback_failed&reason=${encodeURIComponent(reason)}`,
          );
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
