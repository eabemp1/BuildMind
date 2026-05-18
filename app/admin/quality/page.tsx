"use client";
// Redirects to the unified admin dashboard → AI & Quality tab
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function AdminQualityRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin#ai"); }, [router]);
  return null;
}
