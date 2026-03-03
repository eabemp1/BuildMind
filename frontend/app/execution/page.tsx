import TaskCard from "@/components/TaskCard";
import { activeTasks } from "@/lib/mockData";

export default function ExecutionPage() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Execution</h2>
        <p className="mt-1 text-sm text-slate-600">Operate weekly tasks and capture reinforcement feedback.</p>
      </div>

      <div className="grid gap-4">
        {activeTasks.map((task) => (
          <TaskCard key={task.id} title={task.title} milestone={task.milestone} due={task.due} showFeedback />
        ))}
      </div>
    </section>
  );
}
