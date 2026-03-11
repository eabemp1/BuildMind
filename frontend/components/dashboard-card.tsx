import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type DashboardCardProps = {
  title: string;
  value: string;
  trend?: string;
  icon?: React.ReactNode;
  helper?: string;
  tone?: "neutral" | "positive" | "warning";
};

export default function DashboardCard({ title, value, helper, trend, icon, tone = "neutral" }: DashboardCardProps) {
  const toneClass = {
    neutral: "text-zinc-400",
    positive: "text-emerald-300",
    warning: "text-amber-300"
  }[tone];

  return (
    <motion.div whileHover={{ y: -2, scale: 1.01 }} transition={{ duration: 0.2 }}>
      <Card className="glass-panel panel-glow border-white/10 bg-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-zinc-400">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-semibold text-zinc-100">{value}</p>
                {icon ? <span className="text-indigo-300">{icon}</span> : null}
              </div>
              {trend ? <p className="mt-1 text-xs text-zinc-500">{trend}</p> : null}
            </div>
            <span
              className={cn(
                "inline-flex h-2.5 w-2.5 rounded-full",
                tone === "positive" ? "bg-emerald-400" : tone === "warning" ? "bg-amber-400" : "bg-zinc-500",
              )}
            />
          </div>
          {helper ? <p className={cn("mt-2 text-xs", toneClass)}>{helper}</p> : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
