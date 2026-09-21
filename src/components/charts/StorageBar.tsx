import { useState } from 'react';

export interface StorageSegment {
  id: string;
  label: string;
  value: number;
  color: string;
  display?: string;
}

interface StorageBarProps {
  segments: StorageSegment[];
  height?: number;
  legend?: boolean;
  emptyText?: string;
}

/** iOS "Storage"-style segmented capsule with a legend. */
export function StorageBar({ segments, height = 16, legend = true, emptyText = 'Нет данных' }: StorageBarProps) {
  const [active, setActive] = useState<string | null>(null);
  const data = segments.filter((s) => s.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="ch-empty-block">{emptyText}</div>;

  return (
    <div className="ch-storage">
      <div className="ch-storage-bar" style={{ height }}>
        {data.map((d) => (
          <span
            key={d.id}
            className="ch-storage-seg"
            style={{
              flexGrow: d.value,
              background: d.color,
              opacity: active && active !== d.id ? 0.3 : 1,
            }}
            title={`${d.label}: ${Math.round((d.value / total) * 100)}%`}
            onPointerEnter={() => setActive(d.id)}
            onPointerLeave={() => setActive(null)}
          />
        ))}
      </div>
      {legend && (
        <ul className="ch-storage-legend">
          {data.map((d) => (
            <li key={d.id} onPointerEnter={() => setActive(d.id)} onPointerLeave={() => setActive(null)} className={active === d.id ? 'is-active' : ''}>
              <i style={{ background: d.color }} />
              <span>{d.label}</span>
              <b>{d.display ?? `${Math.round((d.value / total) * 100)}%`}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
