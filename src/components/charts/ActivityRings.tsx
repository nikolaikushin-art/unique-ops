import type { ReactNode } from 'react';
import { clamp01 } from './format';

export interface RingDatum {
  id: string;
  label: string;
  /** 0…1 */
  value: number;
  /** Text shown in the legend, e.g. "82%". */
  display: string;
  color: string;
  hint?: string;
  /** No data yet: ring stays as an empty track. */
  unknown?: boolean;
}

interface ActivityRingsProps {
  rings: RingDatum[];
  size?: number;
  stroke?: number;
  center?: ReactNode;
  legend?: boolean;
}

/** Concentric Apple-Fitness rings with a tinted track and rounded caps. */
export function ActivityRings({ rings, size = 156, stroke = 14, center, legend = true }: ActivityRingsProps) {
  const gap = 4;
  return (
    <div className="ch-rings">
      <div className="ch-rings-dial" style={{ width: size, height: size }} role="img" aria-label={rings.map((r) => `${r.label}: ${r.display}`).join(', ')}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {rings.map((r, i) => {
            const radius = (size - stroke) / 2 - i * (stroke + gap);
            if (radius <= stroke) return null;
            const c = 2 * Math.PI * radius;
            const v = r.unknown ? 0 : clamp01(r.value);
            return (
              <g key={r.id}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="ch-ring-track" style={{ stroke: r.color }} />
                {v > 0 && (
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - Math.max(v, 0.012))}
                    className="ch-ring-fill"
                    style={{ stroke: r.color, ['--ring-c' as string]: c }}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {center && <div className="ch-rings-center">{center}</div>}
      </div>

      {legend && (
        <ul className="ch-rings-legend">
          {rings.map((r) => (
            <li key={r.id}>
              <span className="ch-rings-dot" style={{ background: r.color }} />
              <span className="ch-rings-name">
                {r.label}
                {r.hint && <small>{r.hint}</small>}
              </span>
              <b style={{ color: r.unknown ? 'var(--muted)' : r.color }}>{r.unknown ? 'н/д' : r.display}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
