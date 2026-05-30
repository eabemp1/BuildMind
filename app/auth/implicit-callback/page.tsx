"use client";

/**
 * app/auth/implicit-callback/page.tsx
 *
 * ── WHY THE PREVIOUS VERSION NEVER WORKED ────────────────────────────────────
 *
 * The login page calls signInWithOAuth with redirectTo pointing here.
 * The client is configured with flowType: "implicit".
 *
 * The assumption was: Supabase would redirect back with #access_token=... in
 * the URL fragment, and this page would read it from window.location.hash.
 *
 * That assumption is wrong.
 *
 * flowType: "implicit" in @supabase/ssr 0.5.x / supabase-js 2.x only affects
 * password and magic-link flows. For OAuth providers (Google, GitHub, etc.),
 * Supabase ALWAYS redirects back with ?code= as a query parameter — it never
 * puts tokens in the URL fragment for OAuth. This is not configurable from the
 * client SDK. It is controlled by the Supabase Auth server.
 *
 * So what was actually arriving at this page:
 *   /auth/implicit-callback?code=XXXX&next=/today
 *
 * What this page was looking for:
 *   window.location.hash → #access_token=...  (never present)
 *
 * Result: accessToken and refreshToken were both null. The page fell through
 * to getSession(), which returned null because no code was ever exchanged.
 * Error: "Google sign-in returned without a browser session."
 * Redirect: back to /auth/login with error=auth_callback_failed.
 *
 * Meanwhile the original PKCE error ("PKCE code verifier not found in storage")
 * was coming from the Supabase SDK internally — because when the browser client
 * receives a page load with ?code= in the URL, @supabase/ssr automatically
 * tries to exchange the code using PKCE, looks for the verifier in storage,
 * and fails if it's not there. This happens even on this client-rendered page.
 *
 * ── THE ACTUAL FIX ────────────────────────────────────────────────────────────
 *
 * This page now handles ?code= correctly by calling exchangeCodeForSession()
 * — the same thing /auth/callback/route.ts does, but client-side.
 *
 * This works because the code verifier IS present in storage at this point:
 * the same browser that initiated the OAuth flow is the one that lands here,
 * so localStorage still has the verifier from when signInWithOAuth was called.
 *
 * The PKCE verifier error only occurs when:
 *   (a) the callback lands in a DIFFERENT browser tab than where sign-in started
 *   (b) the callback goes to a SERVER ROUTE which has no access to localStorage
 *
 * Neither applies here — this is a client-rendered page in the same browser
 * that started the flow. PKCE works fine. We just need to call the right method.
 *
 * The hash token path (#access_token) is kept as a fallback — it will never
 * fire for Google OAuth but may fire for other providers in future.
 */

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
        // ── Step 1: Check for provider-level errors ──────────────────────────
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

        // ── Step 2: Handle ?code= (Google OAuth — always arrives this way) ───
        // Supabase OAuth always redirects with ?code= regardless of flowType.
        // exchangeCodeForSession() reads the PKCE verifier from localStorage,
        // which is present because this is the same browser that started the flow.
        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            // If exchange failed, check whether a session already exists.
            // This handles the edge case where the user pressed Back and
            // reloaded the callback URL after the code was already exchanged.
            const { data: { session: existingSession } } = await supabase.auth.getSession();
            if (!existingSession) {
              throw new Error(
                `Code exchange failed: ${error.message}. ` +
                `If this keeps happening, check that your Supabase redirect URLs ` +
                `include ${window.location.origin}/auth/implicit-callback`,
              );
            }
            // Session already exists — continue normally
          }
          // Clean the ?code= from the URL bar so it can't be reused or shared
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${
              searchParams.get("next") ? `?next=${searchParams.get("next")}` : ""
            }`,
          );

          await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
          if (!cancelled) router.replace(next);
          return;
        }

        // ── Step 3: Handle #access_token (fallback for non-Google providers) ─
        // This path never fires for Google OAuth but is kept for completeness
        // and for any OAuth provider that Supabase may configure with token flow.
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
          await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
          if (!cancelled) router.replace(next);
          return;
        }

        // ── Step 4: No code and no token — check if already signed in ────────
        // This can happen if the user navigates directly to this page, or if
        // the Supabase SDK already exchanged the code automatically before this
        // effect ran (it listens to URL changes on page load).
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session) {
          // Already authenticated — just continue
          await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
          if (!cancelled) router.replace(next);
          return;
        }

        // No code, no token, no session — genuine failure
        throw new Error(
          "Google sign-in did not return a code or token. " +
          "Check that your Supabase project has " +
          `${window.location.origin}/auth/implicit-callback ` +
          "listed under Authentication → URL Configuration → Redirect URLs.",
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
