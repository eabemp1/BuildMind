type PageHeroProps = {
  title: string;
  subtitle: string;
  kicker?: string;
  actions?: React.ReactNode;
};

export default function PageHero({ title, subtitle, kicker, actions }: PageHeroProps) {
  return (
    <div className="glass-panel panel-glow overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-indigo-500/30 to-purple-500/30 px-6 py-5">
        <div>
          {kicker ? <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">{kicker}</p> : null}
          <h2 className="mt-1 text-2xl font-semibold text-zinc-100">{title}</h2>
          <p className="text-body mt-1 max-w-2xl">{subtitle}</p>
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
