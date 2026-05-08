import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callModelJSON, getAIProviderStatus } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdminUser(userId: string, metadata: Record<string, unknown> | null | undefined): Promise<boolean> {
  if (metadata?.is_admin === true) return true;
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin === true;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(user.id, user.user_metadata))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await callModelJSON<{ verdict: string; reason: string }>(
      [
        {
          role: "system",
          content: "Return only JSON with keys verdict and reason. Keep reason under 12 words.",
        },
        {
          role: "user",
          content: "Say whether reasoning model routing is alive.",
        },
      ],
      { role: "reasoning", temperature: 0.1, maxTokens: 120 },
    );

    return NextResponse.json({
      ok: true,
      role: "reasoning",
      result,
      configuredProviders: getAIProviderStatus().reasoning,
      note: "Check Vercel function logs for '[ai-providers] reasoning succeeded via ...'.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), configuredProviders: getAIProviderStatus().reasoning },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST();
}
