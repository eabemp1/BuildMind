import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardCardProps = {
  title: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "positive" | "warning";
};

export default function DashboardCard({ title, value, helper, tone = "neutral" }: DashboardCardProps) {
  const toneClass = {
    neutral: "text-slate-700",
    positive: "text-emerald-600",
    warning: "text-amber-600"
  }[tone];

  return (
    <Card className="border-slate-200 bg-white/90 shadow-sm backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <p className="text-3xl font-semibold text-slate-900">{value}</p>
          <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", tone === "positive" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-slate-400")} />
        </div>
        {helper ? <p className={cn("mt-2 text-xs", toneClass)}>{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
