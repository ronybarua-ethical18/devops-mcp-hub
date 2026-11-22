type IconProps = { size?: number; className?: string };

/** The hub mark: one box with four connections. */
export function HubMark({ size = 22, className = "text-accent" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="8" y="8" width="8" height="8" rx="2" />
      <path d="M12 8V3M8 12H3M16 12h5M12 16v5" />
    </svg>
  );
}

export function CheckIcon({ size = 14, className = "text-accent" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function PlayIcon({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" className="fill-ink" />
    </svg>
  );
}
