/**
 * app/api/journey/mentor/students/create/route.ts
 * POST { name } — mentor-only. Creates a new student access link.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createStudentLink, listStudentLinks } from "@/lib/journeyAccess";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userResult = await getRouteUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser(userResult.user.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  try {
    const { token, url } = await createStudentLink(userResult.user.id, body.name);
    return NextResponse.json({ ok: true, token, url });
  } catch (err) {
    logError("api.journey.mentor.students.create", err);
    return NextResponse.json({ ok: false, error: "Failed to create link" }, { status: 500 });
  }
}

export async function GET() {
  const userResult = await getRouteUser();
  if (!userResult?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser(userResult.user.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const students = await listStudentLinks();
    return NextResponse.json({ ok: true, students });
  } catch (err) {
    logError("api.journey.mentor.students.list", err);
    return NextResponse.json({ ok: false, error: "Failed to load links" }, { status: 500 });
  }
}
