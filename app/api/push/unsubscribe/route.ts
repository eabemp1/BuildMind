/**
 * app/api/push/unsubscribe/route.ts
 * Removes the user's push subscription from Supabase.
 *
 * SECURITY: userId is derived from the session cookie — NOT from the request
 * body. Accepting userId from the body was an IDOR vulnerability: any
 * authenticated user could delete any other user's push subscription by
 * supplying their target's userId.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
