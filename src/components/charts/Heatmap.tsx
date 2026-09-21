interface HeatmapProps {
  rows: string[];
  cols: string[];
  /** rows × cols */
  values: number[][];
  color?: string;
  unit?: string;
}

/** Week-load heatmap in the style of Apple Health / GitHub contribution grids. */
export function Heatmap({ rows, cols, values, color = 'var(--c-blue)', unit = 'бр.' }: HeatmapProps) {
  const max = Math.max(1, ...values.flat());
  return (
    <div className="ch-heat">
      <div className="ch-heat-grid" style={{ gridTemplateColumns: `34px repeat(${cols.length}, minmax(0, 1fr))` }}>
        <span />
        {cols.map((c) => <span key={c} className="ch-heat-col">{c}</span>)}
        {rows.map((r, ri) => (
          <div key={r} style={{ display: 'contents' }}>
            <span className="ch-heat-row">{r}</span>
            {cols.map((c, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              const t = v / max;
              return (
                <span
                  key={c}
                  className={`ch-heat-cell${v === 0 ? ' is-zero' : ''}`}
                  style={v ? { background: `color-mix(in srgb, ${color} ${Math.round(18 + t * 82)}%, transparent)` } : undefined}
                  title={`${r}, ${c}: ${v} ${unit}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="ch-heat-scale">
        <span>меньше</span>
        {[0.15, 0.4, 0.65, 0.9].map((t) => (
          <i key={t} style={{ background: `color-mix(in srgb, ${color} ${Math.round(18 + t * 82)}%, transparent)` }} />
        ))}
        <span>больше</span>
      </div>
    </div>
  );
}
