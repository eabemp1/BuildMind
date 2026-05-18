"use client";
// Redirects to the unified admin dashboard → Growth tab
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function AdminGrowthRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin#growth"); }, [router]);
  return null;
}
