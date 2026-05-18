"use client";
// My Ventures is now part of the unified Admin Dashboard → Ventures tab.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function MyVenturesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin#ventures"); }, [router]);
  return null;
}
