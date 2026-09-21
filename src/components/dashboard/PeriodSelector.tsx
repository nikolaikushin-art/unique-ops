import type { CSSProperties } from 'react';
import { FINANCE_PERIOD_LABELS, type FinancePeriod } from '../../lib/analytics';

interface PeriodSelectorProps {
  value: FinancePeriod;
  onChange: (p: FinancePeriod) => void;
}

const PERIODS: FinancePeriod[] = ['daily', 'weekly', 'monthly', 'quarterly', '6month', 'annual'];
const SHORT: Partial<Record<FinancePeriod, string>> = { '6month': '6 мес.' };

/** iOS segmented control with a sliding thumb. */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const idx = Math.max(0, PERIODS.indexOf(value));
  return (
    <div className="ch-seg" role="tablist" aria-label="Период" style={{ '--n': PERIODS.length, '--i': idx } as CSSProperties}>
      <span className="ch-seg-thumb" aria-hidden />
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={value === p}
          className={`ch-seg-btn${value === p ? ' is-on' : ''}`}
          onClick={() => onChange(p)}
        >
          <span className="ch-seg-full">{FINANCE_PERIOD_LABELS[p]}</span>
          <span className="ch-seg-short">{SHORT[p] ?? FINANCE_PERIOD_LABELS[p]}</span>
        </button>
      ))}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}

/** Generic sliding segmented control (Reports period, chart mode toggles). */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="ch-seg" role="tablist" aria-label={ariaLabel} style={{ '--n': options.length, '--i': idx } as CSSProperties}>
      <span className="ch-seg-thumb" aria-hidden />
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={`ch-seg-btn${value === o.id ? ' is-on' : ''}`} onClick={() => onChange(o.id)}>
          <span className="ch-seg-full">{o.label}</span>
          <span className="ch-seg-short">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
