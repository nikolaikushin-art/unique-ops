/** Circular progress dial (Apple Fitness-style ring). */
export function RingGauge({
  progress,
  value,
  caption,
  size = 96,
  stroke = 9,
}: {
  progress: number;
  value: string;
  caption: string;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <div className="ring-gauge" style={{ width: size, height: size }} role="img" aria-label={`${caption}: ${value}`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="ring-gauge-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="ring-gauge-fill"
        />
      </svg>
      <div className="ring-gauge-label">
        <span className="ring-gauge-value">{value}</span>
        <span className="ring-gauge-caption">{caption}</span>
      </div>
    </div>
  );
}
