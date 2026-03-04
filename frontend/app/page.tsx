import Link from "next/link";

export default function HomePage() {
  return (
    <section className="max-app space-y-20 py-16">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">EvolvAI OS</p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            Execution infrastructure for early-stage founders.
          </h1>
          <p className="text-lg text-slate-600">
            Turn your startup goal into milestones, track execution weekly, and improve with measurable scoring.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/projects" className="rounded-md bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700">
              Login
            </Link>
            <Link href="/projects" className="rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Get Started
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Founder Execution OS</h2>
          <p className="mt-3 text-sm text-slate-600">Plan. Execute. Measure. Improve.</p>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-slate-900">How It Works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-brand-700">Step 1</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">Define Your Goal</h3>
            <p className="mt-2 text-sm text-slate-600">Create a project with a clear target such as launching an MVP in 60 days.</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-brand-700">Step 2</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">Execute Weekly</h3>
            <p className="mt-2 text-sm text-slate-600">Auto-generated milestones and tasks guide focused execution each week.</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-brand-700">Step 3</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">Track Progress</h3>
            <p className="mt-2 text-sm text-slate-600">Execution Score and analytics quantify consistency and delivery momentum.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
