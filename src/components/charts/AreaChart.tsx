import { useId, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useElementWidth } from './useElementWidth';
import { fmtCompact, niceScale, smoothPath } from './format';

export interface AreaSeries {
  id: string;
  label: string;
  values: number[];
  color: string;
  /** Soft gradient under the line. */
  area?: boolean;
  /** Dashed, quiet line — used for the previous period. */
  dashed?: boolean;
  /** Hidden from the tooltip total but still drawn. */
  muted?: boolean;
}

interface AreaChartProps {
  labels: string[];
  longLabels?: string[];
  series: AreaSeries[];
  height?: number;
  /** Value formatter for the tooltip. */
  format?: (n: number) => string;
  /** Axis formatter (compact). */
  axisFormat?: (n: number) => string;
  emptyText?: string;
  ariaLabel?: string;
  /** Series ids that start switched off (toggle in the legend). */
  initiallyHidden?: string[];
}

const PAD = { top: 14, right: 64, bottom: 26, left: 8 };

/**
 * Apple-Health-style smooth chart: monotone curves, soft gradients, dotted
 * grid with the axis on the right, scrubbing crosshair with a frosted
 * tooltip, tappable legend chips and a draw-in animation.
 */
export function AreaChart({
  labels,
  longLabels,
  series,
  height = 240,
  format = (n) => n.toLocaleString('ru-RU'),
  axisFormat = fmtCompact,
  emptyText = 'Нет данных за период',
  ariaLabel = 'График',
  initiallyHidden = [],
}: AreaChartProps) {
  const uid = useId().replace(/:/g, '');
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initiallyHidden));
  const [hover, setHover] = useState<number | null>(null);

  const n = labels.length;
  const visible = series.filter((s) => !hidden.has(s.id));
  const iw = Math.max(40, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;

  const { scale, hasData } = useMemo(() => {
    const all = visible.flatMap((s) => s.values);
    const lo = all.length ? Math.min(...all) : 0;
    const hi = all.length ? Math.max(...all) : 0;
    return { scale: niceScale(lo, hi, 4), hasData: series.some((s) => s.values.some((v) => v !== 0)) };
  }, [visible, series]);

  const x = (i: number) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - scale.min) / (scale.max - scale.min || 1)) * ih;
  const baseY = y(Math.max(0, scale.min));

  const sig = `${series.map((s) => s.id).join('|')}:${n}:${Math.round(series.reduce((a, s) => a + s.values.reduce((p, v) => p + v, 0), 0))}:${[...hidden].join(',')}`;

  const paths = visible.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
    const line = smoothPath(pts);
    const area = s.area && pts.length > 1 ? `${line} L${pts[pts.length - 1][0].toFixed(2)},${baseY.toFixed(2)} L${pts[0][0].toFixed(2)},${baseY.toFixed(2)} Z` : '';
    return { s, line, area, pts };
  });

  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 58))));
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += step) xTicks.push(i);
  if (n > 1 && xTicks[xTicks.length - 1] !== n - 1 && n - 1 - xTicks[xTicks.length - 1] >= step * 0.6) xTicks.push(n - 1);

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    if (n === 0) return;
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  };

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (visible.length > 1) next.add(id);
      return next;
    });

  const tipLeft = hover === null ? 0 : x(hover);
  const tipSide = hover === null ? '' : tipLeft > width * 0.55 ? 'is-left' : 'is-right';

  return (
    <div className="ch-area">
      <div className="ch-legend" role="group" aria-label="Серии">
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`ch-chip${hidden.has(s.id) ? ' is-off' : ''}`}
            onClick={() => toggle(s.id)}
            aria-pressed={!hidden.has(s.id)}
          >
            <i style={{ background: s.color }} className={s.dashed ? 'is-dashed' : ''} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="ch-plot" ref={ref} style={{ height }} onPointerLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            {paths.map(({ s }) => (
              <linearGradient key={s.id} id={`${uid}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.30" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {scale.ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'ch-base' : 'ch-grid'} x1={PAD.left} x2={width - PAD.right + 6} y1={y(t)} y2={y(t)} />
              {hasData && <text className="ch-ytick" x={width - 2} y={y(t) + 4} textAnchor="end">{axisFormat(t)}</text>}
            </g>
          ))}

          {xTicks.map((i) => (
            <text
              key={i}
              className={`ch-xtick${hover === i ? ' is-on' : ''}`}
              x={x(i)}
              y={height - 7}
              textAnchor={i === 0 && n > 2 ? 'start' : i === n - 1 && n > 2 ? 'end' : 'middle'}
            >
              {labels[i]}
            </text>
          ))}

          <g key={sig}>
            {hasData && paths.map(({ s, line, area }) => (
              <g key={s.id}>
                {area && <path d={area} fill={`url(#${uid}-${s.id})`} className="ch-fade" />}
                <path
                  d={line}
                  pathLength={s.dashed ? undefined : 1}
                  className={`ch-line${s.dashed ? ' is-dashed' : ' ch-draw'}`}
                  style={{ stroke: s.color }}
                />
              </g>
            ))}
          </g>

          {hover !== null && (
            <g>
              <line className="ch-guide" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} />
              {paths.filter(({ s }) => !s.dashed).map(({ s }) => (
                <circle key={s.id} className="ch-dot" cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={5} style={{ stroke: s.color }} />
              ))}
            </g>
          )}

          {hasData && hover === null && paths.filter(({ s }) => !s.dashed && s.values.length > 0).map(({ s, pts }) => (
            <circle key={s.id} className="ch-end" cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} style={{ fill: s.color }} />
          ))}

          <rect
            x={PAD.left}
            y={0}
            width={iw}
            height={height}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
          />
        </svg>

        {!hasData && <div className="ch-empty">{emptyText}</div>}

        {hover !== null && hasData && (
          <div className={`ch-tip ${tipSide}`} style={{ left: tipLeft }}>
            <span className="ch-tip-title">{longLabels?.[hover] ?? labels[hover]}</span>
            {visible.map((s) => (
              <div className="ch-tip-row" key={s.id}>
                <i style={{ background: s.color }} />
                <span>{s.label}</span>
                <b>{format(s.values[hover] ?? 0)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
