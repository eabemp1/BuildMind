/**
 * app/api/push/subscribe/route.ts
 *
 * Saves a user's push subscription to Supabase.
 * You need a table: push_subscriptions(user_id, subscription jsonb, created_at)
 *
 * SQL to create it (run in Supabase SQL editor):
 *
 *   create table if not exists push_subscriptions (
 *     id uuid default gen_random_uuid() primary key,
 *     user_id uuid not null references auth.users(id) on delete cascade,
 *     subscription jsonb not null,
 *     created_at timestamptz default now(),
 *     unique(user_id)
 *   );
 *   alter table push_subscriptions enable row level security;
 *   create policy "Users manage own subscription"
 *     on push_subscriptions for all using (auth.uid() = user_id);
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasAdminEnv } from "@/app/api/ai/_utils";

export async function POST(req: NextRequest) {
  try {
    const { userId, subscription } = await req.json();

    if (!userId || !subscription) {
      return NextResponse.json({ error: "Missing userId or subscription" }, { status: 400 });
    }

    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user || user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = hasAdminEnv() ? createAdminClient() : authClient;

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: userId, subscription }, { onConflict: "user_id" });

    if (error) {
      // Older live schemas may only have a unique index on (user_id, endpoint),
      // so ON CONFLICT (user_id) fails with 42P10. Fall back to replace-by-user.
      if (error.code === "42P10") {
        const { error: deleteError } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId);

        if (deleteError) {
          console.error("[Push Subscribe] replace delete failed", deleteError);
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        const { error: insertError } = await supabase
          .from("push_subscriptions")
          .insert({ user_id: userId, subscription });

        if (!insertError) return NextResponse.json({ ok: true });

        console.error("[Push Subscribe] replace insert failed", insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      console.error("[Push Subscribe]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Push Subscribe] unexpected", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
