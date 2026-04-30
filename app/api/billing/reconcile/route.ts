import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistUserPlan } from "@/lib/billing/server";

type UserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-cron-secret");
  return Boolean(secret) && secret === process.env.CRON_SECRET;
}

async function verifyPaystack(reference: string): Promise<"builder" | "free" | "unknown"> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return "unknown";

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  const payload = (await res.json().catch(() => null)) as
    | { status?: boolean; data?: { status?: string | null } | null }
    | null;

  if (!res.ok || !payload?.status) return "unknown";
  const status = payload.data?.status?.toLowerCase() ?? "";
  if (status === "success") return "builder";
  if (["failed", "abandoned", "reversed"].includes(status)) return "free";
  return "unknown";
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const perPage = 200;
  const maxPages = 3;

  let scanned = 0;
  let reconciled = 0;
  let upgraded = 0;
  let downgraded = 0;
  const errors: string[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const users = ((data?.users ?? []) as UserLike[]);
    if (users.length === 0) break;

    for (const user of users) {
      scanned += 1;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const provider = typeof meta.billing_provider === "string" ? meta.billing_provider : "";
      const currentPlan = typeof meta.plan === "string" ? meta.plan : "free";
      const reference = typeof meta.billing_reference === "string" ? meta.billing_reference : "";

      if (provider !== "paystack") continue;

      try {
        let providerPlan: "builder" | "free" | "unknown" = "unknown";
        if (provider === "paystack" && reference) {
          providerPlan = await verifyPaystack(reference);
        }

        if (providerPlan === "unknown") continue;
        if (providerPlan === currentPlan) continue;

        await persistUserPlan(user.id, providerPlan, {
          provider: "paystack",
          status: providerPlan === "builder" ? "active" : "canceled",
          reference: reference || null,
          customerEmail: user.email?.toLowerCase() ?? null,
          meta: {
            billing_reconciled_at: new Date().toISOString(),
            billing_reconcile_source: "api/billing/reconcile",
          },
        });

        reconciled += 1;
        if (providerPlan === "builder") upgraded += 1;
        else downgraded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown reconcile error";
        errors.push(`${user.id}: ${message}`);
      }
    }

    if (users.length < perPage) break;
  }

  console.info("[Billing Reconcile] Completed", {
    scanned,
    reconciled,
    upgraded,
    downgraded,
    errorCount: errors.length,
  });

  return NextResponse.json({
    ok: true,
    scanned,
    reconciled,
    upgraded,
    downgraded,
    errors: errors.slice(0, 20),
  });
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  }

  return POST(
    new NextRequest(req.url, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET || "" },
    }),
  );
}
