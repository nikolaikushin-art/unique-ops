import { useId } from 'react';
import { smoothPath } from './format';

interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
  area?: boolean;
}

/** Tiny axis-less trend line for metric tiles. */
export function Sparkline({ values, color = 'var(--c-blue)', height = 44, area = true }: SparklineProps) {
  const uid = useId().replace(/:/g, '');
  const W = 120;
  const n = values.length;
  const flat = n < 2 || values.every((v) => v === values[0]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const pad = 5;
  const pts: [number, number][] = values.map((v, i) => [
    n <= 1 ? W / 2 : (i / (n - 1)) * W,
    height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2),
  ]);
  const line = smoothPath(pts);
  const fill = pts.length > 1 ? `${line} L${W},${height} L0,${height} Z` : '';
  const last = pts[pts.length - 1];

  if (n === 0 || (flat && values[0] === 0)) {
    return (
      <div className="ch-spark is-empty" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden>
          <line x1="0" x2={W} y1={height - pad} y2={height - pad} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    );
  }

  return (
    <div className="ch-spark" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-sp`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && fill && <path d={fill} fill={`url(#${uid}-sp)`} />}
        <path d={line} pathLength={1} className="ch-spark-line ch-draw" style={{ stroke: color }} vectorEffect="non-scaling-stroke" />
      </svg>
      {last && <span className="ch-spark-dot" style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / height) * 100}%`, background: color }} />}
    </div>
  );
}
