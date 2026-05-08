import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (!isCronRequest(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", hint: "Vercel Cron must send Authorization: Bearer <CRON_SECRET>." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    cron: true,
    message: "Evening check cron is reachable. Supabase scheduled-jobs performs batch nudges.",
  });
}

export async function POST(req: Request) {
  return GET(req);
}
