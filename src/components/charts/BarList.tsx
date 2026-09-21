import type { ReactNode } from 'react';

export interface BarItem {
  id: string;
  label: string;
  sub?: ReactNode;
  value: number;
  /** Text at the right end of the row. */
  display: string;
  color?: string;
  badge?: { text: string; tone: 'green' | 'orange' | 'red' | 'blue' | 'gray' };
  /** Second, lighter fill drawn behind the value bar (0…max scale). */
  secondary?: number;
  /** Vertical tick on the track (same scale as value), e.g. a minimum level. */
  marker?: number;
  onClick?: () => void;
}

interface BarListProps {
  items: BarItem[];
  /** Scale maximum; defaults to the biggest value. */
  max?: number;
  emptyText?: string;
}

/** Ranked rounded bars with gradient fill — replaces plain text rows. */
export function BarList({ items, max, emptyText = 'Нет данных' }: BarListProps) {
  if (!items.length) return <div className="ch-empty-block">{emptyText}</div>;
  const scale = max ?? Math.max(...items.map((i) => Math.max(i.value, i.secondary ?? 0, i.marker ?? 0)), 1);

  return (
    <div className="ch-bars">
      {items.map((it, idx) => {
        const w = Math.min(100, (Math.max(it.value, 0) / scale) * 100);
        const w2 = it.secondary !== undefined ? Math.min(100, (it.secondary / scale) * 100) : null;
        const mk = it.marker !== undefined ? Math.min(100, (it.marker / scale) * 100) : null;
        const color = it.color ?? 'var(--c-blue)';
        return (
          <div
            key={it.id}
            className={`ch-bar-row${it.onClick ? ' is-click' : ''}`}
            onClick={it.onClick}
            style={{ ['--i' as string]: idx }}
          >
            <div className="ch-bar-top">
              <span className="ch-bar-label">{it.label}</span>
              {it.badge && <span className={`ch-badge is-${it.badge.tone}`}>{it.badge.text}</span>}
              <b className="ch-bar-value">{it.display}</b>
            </div>
            <div className="ch-bar-track">
              {w2 !== null && <span className="ch-bar-fill is-secondary" style={{ width: `${w2}%`, background: color }} />}
              <span className="ch-bar-fill" style={{ width: `${w}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 72%, transparent), ${color})` }} />
              {mk !== null && <span className="ch-bar-marker" style={{ left: `${mk}%` }} />}
            </div>
            {it.sub && <div className="ch-bar-sub">{it.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
