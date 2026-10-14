import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whose data a request may touch. The founder (admin) sees rows with no
 * promoter_id; a promoter sees only rows stamped with their own id.
 */
export interface Scope { userId: string; promoterId: string | null }

export async function requireOwner(): Promise<Scope | { res: NextResponse }> {
  const u = await getRouteUser();
  if (!u) return { res: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!(await isAdminUser(u.userId))) return { res: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { userId: u.userId, promoterId: null };
}

/** Promoters have no account; their private link token is their credential. */
export async function requirePromoter(token: string): Promise<Scope | { res: NextResponse }> {
  if (!token || token.length < 16) return { res: NextResponse.json({ ok: false, error: "Not found" }, { status: 404 }) };
  const { data } = await createAdminClient().from("promoters").select("id").eq("access_token", token).maybeSingle();
  if (!data) return { res: NextResponse.json({ ok: false, error: "Not found" }, { status: 404 }) };
  return { userId: data.id as string, promoterId: data.id as string };
}

export const isRes = (x: Scope | { res: NextResponse }): x is { res: NextResponse } => "res" in x;
