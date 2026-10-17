/** POST /api/companion/event { key, status: "dismissed" | "acted" } */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ key: z.string().trim().min(1).max(160), status: z.enum(["dismissed", "acted"]) });

export async function POST(request: Request) {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid event" }, { status: 400 });

  const now = new Date();
  try {
    await createAdminClient().from("companion_events").upsert(
      { user_id: user.userId, moment_key: parsed.data.key, day: now.toISOString().slice(0, 10), status: parsed.data.status, updated_at: now.toISOString() },
      { onConflict: "user_id,moment_key,day" },
    );
  } catch { return NextResponse.json({ ok: false, error: "Could not save" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
