import { NextRequest, NextResponse } from "next/server";
import { persistUserPlan } from "@/lib/billing/server";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getAdminUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest) {
  const callerId = await getAdminUserId();
  if (!callerId || !(await isAdminUser(callerId))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { userId, plan } = await req.json();
  if (!userId || !["free", "builder"].includes(plan)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  await persistUserPlan(userId, plan);
  return NextResponse.json({ ok: true });
}
