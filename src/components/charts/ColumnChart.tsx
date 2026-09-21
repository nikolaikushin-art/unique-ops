interface ColumnChartProps {
  values: number[];
  labels: string[];
  color?: string;
  height?: number;
  /** Formats the value shown above the tallest bar and in hover titles. */
  format?: (n: number) => string;
  unit?: string;
  emptyText?: string;
}

/** Rounded vertical bars (hour / bucket distributions). The tallest bar is called out. */
export function ColumnChart({ values, labels, color = 'var(--c-blue)', height = 150, format = (n) => String(n), unit = '', emptyText = 'Нет данных' }: ColumnChartProps) {
  const max = Math.max(...values, 0);
  if (max === 0) return <div className="ch-empty-block">{emptyText}</div>;
  const top = values.indexOf(max);
  return (
    <div className="ch-cols" style={{ height }}>
      {values.map((v, i) => (
        <div className="ch-col" key={i} title={`${labels[i]}: ${format(v)}${unit}`}>
          <div className="ch-col-track">
            {i === top && <span className="ch-col-tag">{format(v)}</span>}
            <span
              className={`ch-col-bar${i === top ? ' is-top' : ''}`}
              style={{ height: `${Math.max(v > 0 ? 5 : 0, (v / max) * 100)}%`, background: i === top ? color : `color-mix(in srgb, ${color} 42%, transparent)`, animationDelay: `${i * 25}ms` }}
            />
          </div>
          <span className="ch-col-label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
