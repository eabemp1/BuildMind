import { milestones } from "@/lib/mockData";

export default function ProjectsPage() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Projects</h2>
        <p className="mt-1 text-sm text-slate-600">Define goals, generate roadmap milestones, and track deliverables.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Create Project</h3>
        <form className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="goal" className="text-sm font-medium text-slate-700">
              Goal
            </label>
            <input
              id="goal"
              type="text"
              placeholder="Launch MVP in 60 days"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="description" className="text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              placeholder="Describe your project objective and constraints."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Create Project
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Generate Roadmap
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Milestones & Tasks</h3>
        {milestones.map((milestone) => (
          <article key={milestone.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-slate-900">
                Week {milestone.week}: {milestone.title}
              </h4>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {milestone.tasks.length} tasks
              </span>
            </div>
            <ul className="mt-4 space-y-2">
              {milestone.tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  {task.title}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
