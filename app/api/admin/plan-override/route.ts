import { NextRequest, NextResponse } from "next/server";
import { persistUserPlan } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

async function isAdmin(userId: string) {
  const allowlist = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowlist.includes(userId)) return true;
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  return Boolean(data?.user?.user_metadata?.is_admin);
}

export async function POST(req: NextRequest) {
  const callerId = await getAdminUserId();
  if (!callerId || !(await isAdmin(callerId))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { userId, plan } = await req.json();
  if (!userId || !["free", "builder"].includes(plan)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  await persistUserPlan(userId, plan);
  return NextResponse.json({ ok: true });
}
