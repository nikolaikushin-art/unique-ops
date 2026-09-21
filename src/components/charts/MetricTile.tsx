import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

interface MetricTileProps {
  label: string;
  value: ReactNode;
  /** Delta chip text, e.g. "+12,4%". */
  delta?: string;
  /** Direction for chip color. `good` overrides when "up" is bad (expenses). */
  deltaTone?: 'up' | 'down' | 'flat';
  note?: ReactNode;
  spark?: number[];
  color?: string;
  onClick?: () => void;
}

/** KPI tile: label, big tabular number, delta chip and an inline sparkline. */
export function MetricTile({ label, value, delta, deltaTone = 'flat', note, spark, color = 'var(--c-blue)', onClick }: MetricTileProps) {
  return (
    <div className={`ch-tile${onClick ? ' is-click' : ''}`} onClick={onClick} style={{ ['--tile' as string]: color }}>
      <div className="ch-tile-head">
        <span className="ch-tile-label">{label}</span>
        {delta && <span className={`ch-delta is-${deltaTone}`}>{delta}</span>}
      </div>
      <div className="ch-tile-value">{value}</div>
      {note && <div className="ch-tile-note">{note}</div>}
      {spark && <Sparkline values={spark} color={color} />}
    </div>
  );
}
