export default function Topbar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-app flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="project-switcher" className="text-sm font-medium text-slate-600">
            Project
          </label>
          <select
            id="project-switcher"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-brand-500 focus:ring-2"
            defaultValue="launch-mvp"
          >
            <option value="launch-mvp">Launch MVP in 60 days</option>
            <option value="pilot-sales">Pilot B2B sales sprint</option>
            <option value="retention">Improve retention by 20%</option>
          </select>
        </div>
        <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          Nana Founder
        </button>
      </div>
    </header>
  );
}
