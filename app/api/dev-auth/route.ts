import { NextResponse, type NextRequest } from "next/server";

function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "1";
}

export async function POST(request: NextRequest) {
  if (!isDevAuthEnabled()) {
    return NextResponse.json({ error: "Dev auth is disabled." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const expectedEmail = String(process.env.DEV_TEST_EMAIL ?? "test@buildmind.local").trim().toLowerCase();
  const expectedPassword = String(process.env.DEV_TEST_PASSWORD ?? "buildmind-test");

  if (email !== expectedEmail || password !== expectedPassword) {
    return NextResponse.json({ error: "Invalid local test credentials." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, email });
  response.cookies.set("bm_dev_auth", "1", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("bm_dev_auth");
  response.cookies.delete("bm_dev_onboarded");
  return response;
}
