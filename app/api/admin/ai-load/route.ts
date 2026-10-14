import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { readAILoad, dailyCeiling } from "@/lib/server/aiBudget";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRouteUser();
  if (!user || !(await isAdminUser(user.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const load = await readAILoad();
  return NextResponse.json({ ceiling: dailyCeiling(), load });
}
