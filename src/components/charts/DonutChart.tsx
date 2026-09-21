import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;
  /** Formatted value for the legend, e.g. "320 000 ₽". */
  display?: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: ReactNode;
  emptyText?: string;
}

/** Segmented donut with a live legend; hovering a row or slice isolates it. */
export function DonutChart({ segments, size = 176, thickness = 22, centerLabel, centerValue, emptyText = 'Нет данных' }: DonutChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const data = useMemo(() => segments.filter((s) => s.value > 0), [segments]);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = data.length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = data.map((d) => {
    const len = (d.value / total) * c;
    const arc = { d, len: Math.max(len - gap, 0.5), offset };
    offset += len;
    return arc;
  });

  const focus = data.find((d) => d.id === active) ?? null;

  return (
    <div className="ch-donut">
      <div className="ch-donut-dial" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={centerLabel ?? 'Структура'}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="ch-donut-track" />
          {arcs.map(({ d, len, offset: off }) => (
            <circle
              key={d.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={active === d.id ? thickness + 4 : thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-off}
              className="ch-donut-seg"
              style={{ stroke: d.color, opacity: active && active !== d.id ? 0.28 : 1 }}
              onPointerEnter={() => setActive(d.id)}
              onPointerLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="ch-donut-center">
          {total === 0 ? (
            <span className="ch-donut-cap">{emptyText}</span>
          ) : (
            <>
              <b>{focus ? `${Math.round((focus.value / total) * 100)}%` : centerValue}</b>
              <span className="ch-donut-cap">{focus ? focus.label : centerLabel}</span>
            </>
          )}
        </div>
      </div>

      <ul className="ch-donut-legend">
        {data.map((d) => (
          <li
            key={d.id}
            className={active === d.id ? 'is-active' : ''}
            onPointerEnter={() => setActive(d.id)}
            onPointerLeave={() => setActive(null)}
          >
            <i style={{ background: d.color }} />
            <span className="ch-donut-name">{d.label}</span>
            <span className="ch-donut-pct">{Math.round((d.value / total) * 100)}%</span>
            {d.display && <b>{d.display}</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}
