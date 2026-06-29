"use client";

/** SVG progress ring for the call window. progress: 1 = full, 0 = expired. */
export function CountdownRing({
  progress,
  seconds,
  size = 92,
}: {
  progress: number;
  seconds: number;
  size?: number;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circ * (1 - clamped);
  const color =
    clamped > 0.5
      ? "var(--color-yes)"
      : clamped > 0.25
        ? "var(--color-market)"
        : "var(--color-no)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-border)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-mono tnum text-2xl font-semibold" style={{ color }}>
          {seconds}
        </span>
      </div>
    </div>
  );
}
