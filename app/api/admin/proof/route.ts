import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/server/adminAuth";

async function getCallerUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const callerId = await getCallerUserId();
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminUser(callerId))) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const admin = createAdminClient();
  const [retention, advancement, trajectory, activity] = await Promise.allSettled([
    admin.rpc("compute_w1_w4_retention"),
    admin.rpc("compute_stage_advancement_rate"),
    admin.rpc("compute_behaviour_trajectory"),
    admin.from("activity_log").select("event_type, occurred_at").order("occurred_at", { ascending: false }).limit(100),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      retention: retention.status === "fulfilled" && !retention.value.error ? retention.value.data : [],
      stage_advancement: advancement.status === "fulfilled" && !advancement.value.error ? advancement.value.data : [],
      behaviour_trajectory: trajectory.status === "fulfilled" && !trajectory.value.error ? trajectory.value.data : [],
      recent_activity: activity.status === "fulfilled" && !activity.value.error ? activity.value.data : [],
    },
  });
}
