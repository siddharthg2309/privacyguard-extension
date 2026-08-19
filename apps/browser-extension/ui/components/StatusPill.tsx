export type StatusTone = "protected" | "warning" | "unavailable";

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
