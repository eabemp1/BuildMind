"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AdminTopbar() {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">BuildMind SaaS</p>
        <h2 className="text-sm font-semibold text-slate-900">Platform Administration</h2>
      </div>
      <Button className="w-full sm:w-auto" variant="outline" onClick={() => router.push("/dashboard")}>
        Back to User Dashboard
      </Button>
    </div>
  );
}
