export interface FunnelStep {
  id: string;
  label: string;
  value: number;
  color: string;
  display?: string;
}

/** Conversion funnel: each step is a rounded bar, with step-to-step conversion chips. */
export function Funnel({ steps, emptyText = 'Нет данных' }: { steps: FunnelStep[]; emptyText?: string }) {
  const top = Math.max(...steps.map((s) => s.value), 0);
  if (!top) return <div className="ch-empty-block">{emptyText}</div>;
  return (
    <div className="ch-funnel">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div className="ch-funnel-step" key={s.id}>
            {conv !== null && <div className="ch-funnel-conv"><span>↓ {conv}%</span></div>}
            <div className="ch-funnel-row">
              <span className="ch-funnel-label">{s.label}</span>
              <b>{s.display ?? s.value.toLocaleString('ru-RU')}</b>
            </div>
            <div className="ch-funnel-track">
              <span style={{ width: `${Math.max(2, (s.value / top) * 100)}%`, background: s.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
