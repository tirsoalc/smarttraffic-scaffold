interface MetricCardProps {
  label: string;
  value: string;
  helper: string;
  tone?: "accent" | "neutral";
}

export function MetricCard({
  label,
  value,
  helper,
  tone = "neutral"
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}
