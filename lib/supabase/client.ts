import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_SUPABASE_URL = "https://example.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "public-anon-key-placeholder";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Avoid crashing during prerender/build when NEXT_PUBLIC_* vars are absent.
  // Runtime auth calls will fail gracefully until real env values are provided.
  if (!url || !anonKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Using safe fallback values."
      );
    }
    return createBrowserClient(FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_ANON_KEY, {
      auth: {
        flowType: "implicit",
      },
    });
  }

  return createBrowserClient(
    url,
    anonKey,
    {
      auth: {
        flowType: "implicit",
      },
    }
  );
}
