import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProgressBar from "@/components/progress-bar";

type MilestoneCardProps = {
  title: string;
  status: string;
  progress: number;
  tasks: Array<{ id: string; title: string; done: boolean }>;
};

export default function MilestoneCard({ title, status, progress, tasks }: MilestoneCardProps) {
  return (
    <Card className="border-slate-200/80 bg-white/90">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge className="border-slate-200 bg-slate-50 text-slate-700">{status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProgressBar value={progress} label={`${Math.round(progress)}% complete`} />
        <ul className="space-y-2 text-sm text-slate-700">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1">
              <span className={task.done ? "text-emerald-600" : "text-slate-400"}>{task.done ? "●" : "○"}</span>
              <span>{task.title}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
