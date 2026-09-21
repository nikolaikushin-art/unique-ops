import { COMPARISON_KIND_LABELS } from '../../lib/analytics';
import { fmt } from '../../lib/constants';
import type { ExecutiveMetrics } from '../../hooks/useExecutiveMetrics';
import { Segmented } from './PeriodSelector';
import { fmtDelta } from '../charts/format';
import { TINT } from '../charts/palette';

type ComparisonKind = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface PeriodComparisonProps {
  comparisons: ExecutiveMetrics['comparisons'];
  active?: ComparisonKind;
  onSelect?: (kind: ComparisonKind) => void;
}

const KINDS: ComparisonKind[] = ['day', 'week', 'month', 'quarter', 'year'];
const OPTIONS = KINDS.map((k) => ({ id: k, label: COMPARISON_KIND_LABELS[k] }));

function Pair({ label, cur, prev, pct, money, color }: { label: string; cur: number; prev: number; pct: number | null; money?: boolean; color: string }) {
  const max = Math.max(cur, prev, 1);
  const f = (n: number) => (money ? fmt(n) : n.toLocaleString('ru-RU'));
  const tone = pct === null || pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down';
  return (
    <div className="ch-tile" style={{ ['--tile' as string]: color }}>
      <div className="ch-tile-head">
        <span className="ch-tile-label">{label}</span>
        <span className={`ch-delta is-${tone}`}>{fmtDelta(pct)}</span>
      </div>
      <div className="ch-tile-value">{f(cur)}</div>
      <div className="ch-pair">
        <div className="ch-pair-row"><span>сейчас</span><i><b style={{ width: `${(cur / max) * 100}%`, background: color }} /></i></div>
        <div className="ch-pair-row"><span>раньше</span><i><b style={{ width: `${(prev / max) * 100}%`, background: TINT.gray, opacity: 0.55 }} /></i></div>
      </div>
      <div className="ch-tile-note">было {f(prev)}</div>
    </div>
  );
}

/** Period switch (iOS segmented) + current-vs-previous tiles with paired bars. */
export function PeriodComparisonPanel({ comparisons, active = 'month', onSelect }: PeriodComparisonProps) {
  const data = comparisons[active];
  return (
    <div className="dashboard-comparison">
      <div style={{ marginBottom: 16 }}>
        <Segmented options={OPTIONS} value={active} onChange={(k) => onSelect?.(k)} ariaLabel="Период сравнения" />
      </div>
      <div className="dx-grid dx-3">
        <Pair label="Выручка" cur={data.revenue.current} prev={data.revenue.previous} pct={data.revenue.changePct} money color={TINT.blue} />
        <Pair label="Завершено работ" cur={data.completedJobs.current} prev={data.completedJobs.previous} pct={data.completedJobs.changePct} color={TINT.green} />
        <Pair label="Новые клиенты" cur={data.newCustomers.current} prev={data.newCustomers.previous} pct={data.newCustomers.changePct} color={TINT.purple} />
      </div>
    </div>
  );
}
