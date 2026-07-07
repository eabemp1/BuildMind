"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * FoundingMemberBadge
 *
 * Reads subscriptions.is_founding_member for the current user and, if true,
 * shows a badge plus a link to submit roadmap feedback — honoring the second
 * half of the "lifetime founder pricing + direct input on the roadmap" promise.
 *
 * Renders nothing for everyone else — safe to drop into any page.
 * Usage: <FoundingMemberBadge /> e.g. near the top of app/today/page.tsx
 * or in a settings/profile page.
 */
export function FoundingMemberBadge() {
  const [isFounding, setIsFounding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("subscriptions")
        .select("is_founding_member")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data?.is_founding_member) setIsFounding(true);
    }
    check();
    return () => { cancelled = true; };
  }, []);

  if (!isFounding) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(99,102,241,0.12)",
        border: "1px solid rgba(99,102,241,0.3)",
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--bm-accent, #6366f1)",
      }}
    >
      ⚡ Founding Member
      <a
        href="mailto:hello@buildmind.live?subject=Roadmap%20feedback"
        style={{ color: "inherit", textDecoration: "underline", fontWeight: 500 }}
      >
        Share roadmap feedback
      </a>
    </div>
  );
}
