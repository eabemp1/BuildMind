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
    <Card className="glass-panel panel-glow">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="bm-text">{title}</CardTitle>
        <Badge className="border-[var(--bm-border2)] bg-white/5 bm-text2">{status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProgressBar value={progress} label={`${Math.round(progress)}% complete`} />
        <ul className="space-y-2 text-sm bm-text2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 rounded-md border border-[var(--bm-border2)] bg-white/5 px-2 py-1">
              <span className={task.done ? "text-emerald-400" : "bm-text3"}>{task.done ? "●" : "○"}</span>
              <span>{task.title}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
