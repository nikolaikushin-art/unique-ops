import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmt } from '../../lib/constants';
import { AreaChart } from '../charts/AreaChart';
import { fmtMoneyCompact } from '../charts/format';
import { TINT } from '../charts/palette';

interface FinanceSnapshotProps {
  paidRevenue: number;
  owedAmount: number;
  overdueCount: number;
  /** Revenue per day, oldest → newest; the last entry is today. */
  revenueSeries: number[];
  /** Hide the 7-day chart (page-level "Скрыть аналитику"). */
  showChart?: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function FinanceSnapshot({ paidRevenue, owedAmount, overdueCount, revenueSeries, showChart = true }: FinanceSnapshotProps) {
  const navigate = useNavigate();
  const n = revenueSeries.length;
  const days = useMemo(() => Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return {
      short: cap(d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '')),
      long: cap(d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })),
    };
  }), [n]);
  const week = revenueSeries.reduce((s, v) => s + v, 0);

  return (
    <div className="dashboard-widget finance-widget">
      <div className="widget-head">
        <div>
          <div className="section-eyebrow">Финансы</div>
          <div className="section-title">Финансовая сводка</div>
        </div>
        <div className="link-btn" onClick={() => navigate('/finance')}>Подробнее →</div>
      </div>
      <div className="widget-stats">
        <div className="widget-stat">
          <div className="widget-stat-label">Выручка за месяц</div>
          <div className="widget-stat-value">{fmt(paidRevenue)}</div>
        </div>
        <div className="widget-stat">
          <div className="widget-stat-label">К оплате</div>
          <div className="widget-stat-value">{fmt(owedAmount)}</div>
          {overdueCount > 0 && <div className="widget-stat-note down">{overdueCount} просрочено</div>}
        </div>
      </div>
      {showChart && (
        <>
      <div className="dx-eyebrow" style={{ margin: '4px 0 6px' }}>Оплаты за 7 дней · <b style={{ color: 'var(--text)' }}>{fmt(week)}</b></div>
      <AreaChart
        ariaLabel="Выручка за неделю"
        height={170}
        labels={days.map((d) => d.short)}
        longLabels={days.map((d) => d.long)}
        format={fmt}
        axisFormat={fmtMoneyCompact}
        emptyText="За 7 дней оплат не было"
        series={[{ id: 'rev', label: 'Оплаты', values: revenueSeries, color: TINT.blue, area: true }]}
      />
        </>
      )}
    </div>
  );
}
