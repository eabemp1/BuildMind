import { createBrowserClient } from "@supabase/ssr";

function makeCookieStorage() {
  return {
    getItem(key: string): string | null {
      if (typeof document === "undefined") return null;
      const match = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${key}=`));
      return match ? decodeURIComponent(match.split("=")[1]) : null;
    },
    setItem(key: string, value: string): void {
      if (typeof document === "undefined") return;
      // SameSite=None;Secure is required so this cookie is sent back when
      // Google redirects to /auth/callback — that redirect is a cross-site
      // navigation and SameSite=Lax cookies are blocked on it.
      document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=3600;SameSite=None;Secure`;
    },
    removeItem(key: string): void {
      if (typeof document === "undefined") return;
      document.cookie = `${key}=;path=/;max-age=0;SameSite=None;Secure`;
    },
  };
}

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        storage: makeCookieStorage(),
      },
    },
  );
  return client;
          }  return client;
        }
