export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="AI Privacy Firewall">
      <span className="brand-mark" aria-hidden="true" />
      <span>
        <strong>{compact ? "Privacy Firewall" : "AI Privacy Firewall"}</strong>
      </span>
    </div>
  );
}
