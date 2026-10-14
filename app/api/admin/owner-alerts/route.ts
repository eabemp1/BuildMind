import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOwner, ownerChannels, instantLimit } from "@/lib/ownerNotify";

async function guard() {
  const user = await getRouteUser();
  if (!user || !(await isAdminUser(user.userId))) return null;
  return user;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { data } = await admin.from("owner_events").select("id, kind, payload, created_at").order("created_at", { ascending: false }).limit(40);
  return NextResponse.json({ channels: ownerChannels(), instantLimit: instantLimit(), events: data ?? [] });
}

export async function POST() {
  if (!(await guard())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sent = await notifyOwner({ title: "BuildMind test alert", body: "If you can read this, owner alerts work.", url: "https://buildmind.live/admin" });
  return NextResponse.json({ sent });
}
