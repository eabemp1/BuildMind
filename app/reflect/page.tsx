"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /reflect is deprecated — reflection now happens inline on /today
 * via the ReflectSheet component after task completion.
 * This redirect ensures any existing links or bookmarks still work.
 */
export default function ReflectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/today");
  }, [router]);

  return null;
}
