type PageHeroProps = {
  title: string;
  subtitle: string;
  kicker?: string;
  actions?: React.ReactNode;
};

export default function PageHero({ title, subtitle, kicker, actions }: PageHeroProps) {
  return (
    <div style={{
      background: "var(--bm-bg2)",
      border: "1px solid var(--bm-border)",
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 24,
    }}>
      <div style={{
        display: "flex", flexWrap: "wrap",
        alignItems: "center", justifyContent: "space-between",
        gap: 16, padding: "20px 24px",
        background: "var(--bm-grad-hero)",
        borderBottom: "1px solid var(--bm-border)",
      }}>
        <div>
          {kicker && (
            <p style={{
              fontSize: 10, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--bm-accent)",
              fontWeight: 600, marginBottom: 5,
            }}>
              {kicker}
            </p>
          )}
          <h2 style={{
            fontSize: 20, fontWeight: 600,
            color: "var(--bm-text)", letterSpacing: "-0.02em",
            margin: 0,
          }}>
            {title}
          </h2>
          <p style={{
            fontSize: 13, color: "var(--bm-text3)",
            marginTop: 5, maxWidth: 560, lineHeight: 1.6,
          }}>
            {subtitle}
          </p>
        </div>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
