import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";

/** The studio is private: admin only. Returns the user id, or a ready 401/403 response. */
export async function requireOwner(): Promise<{ userId: string } | { res: NextResponse }> {
  const u = await getRouteUser();
  if (!u) return { res: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!(await isAdminUser(u.userId))) return { res: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { userId: u.userId };
}
