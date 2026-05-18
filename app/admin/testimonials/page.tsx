"use client";
// Redirects to the unified admin dashboard → Testimonials tab
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function AdminTestimonialsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin#testimonials"); }, [router]);
  return null;
}
