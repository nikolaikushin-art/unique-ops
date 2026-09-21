import { useEffect, useMemo, useState } from 'react';
import { AccountingReport } from '../components/accounting/AccountingReport';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { db } from '../lib/localdb';
import { fmt } from '../lib/constants';
import { getComparisonRanges, inRange, pctChange, buildBuckets, sumIntoBuckets, type PeriodComparison } from '../lib/analytics';
import { unwrapRelation } from '../lib/relations';
import { averageCheck, bookingValue, buildRevenueEvents, completedIn, doneAt, serviceName, isDoneStatus, type MetricBooking, type MetricInvoice } from '../lib/metrics';
import { useToast } from '../contexts/ToastContext';
import { Segmented } from '../components/dashboard/PeriodSelector';
import {
  ActivityRings,
  AreaChart,
  BarList,
  DonutChart,
  Funnel,
  Heatmap,
  InsightSummary,
  Insights,
  MetricTile,
  TINT,
  colorAt,
  fmtCompact,
  fmtDelta,
  fmtMoneyCompact,
} from '../components/charts';
import { diagnoseReports } from '../lib/diagnostics';
import { ReconciliationPanel } from '../components/ReconciliationPanel';

type Kind = 'day' | 'week' | 'month' | 'quarter' | 'year';
const KIND_OPTIONS: { id: Kind; label: string }[] = [
  { id: 'day', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
];
const KIND_LABEL: Record<Kind, string> = { day: 'Сегодня', week: 'Неделя', month: 'Месяц', quarter: 'Квартал', year: 'Год' };

interface RBooking extends MetricBooking {
  created_at: string;
  staff?: { full_name?: string } | null;
}
type RInvoice = MetricInvoice;
interface RCustomer { created_at: string; visit_count: number }
interface RStaff { full_name: string; workload_pct: number }

function normalize(raw: Record<string, unknown>): RBooking {
  return {
    id: String(raw.id ?? ''),
    status: String(raw.status ?? ''),
    created_at: String(raw.created_at ?? ''),
    completed_at: raw.completed_at as string | null | undefined,
    scheduled_at: String(raw.scheduled_at ?? ''),
    payment_status: raw.payment_status as string | undefined,
    customer_id: raw.customer_id as string | null | undefined,
    estimated_value: raw.estimated_value as number | null | undefined,
    services: unwrapRelation(raw.services as { price?: number; name?: string } | { price?: number; name?: string }[] | null),
    staff: unwrapRelation(raw.staff as { full_name?: string } | { full_name?: string }[] | null),
  };
}

const isDone = (b: RBooking) => isDoneStatus(b.status);

interface Snapshot {
  revenue: number;
  completed: number;
  paid: number;
  bookings: number;
  newCustomers: number;
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const SLOT_COLS = ['8', '10', '12', '14', '16', '18'];

export function ReportsPage() {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>('month');
  const [showCharts, toggleCharts] = useAnalyticsVisibility('reports');
  const [bookings, setBookings] = useState<RBooking[]>([]);
  const [invoices, setInvoices] = useState<RInvoice[]>([]);
  const [customers, setCustomers] = useState<RCustomer[]>([]);
  const [staff, setStaff] = useState<RStaff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [b, i, c, s] = await Promise.all([
          db.from('bookings').select('id, status, created_at, completed_at, scheduled_at, assigned_technician_id, customer_id, service_id, payment_status, estimated_value, invoice_id, extra_items, discount, staff:assigned_technician_id(full_name), services(name, price)'),
          db.from('invoices').select('id, amount, status, created_at, paid_at, due_date, customer_id, description, booking_id, payments'),
          db.from('customers').select('created_at, visit_count'),
          db.from('staff').select('full_name, workload_pct'),
        ]);
        setBookings(((b.data ?? []) as Record<string, unknown>[]).map(normalize));
        setInvoices((i.data ?? []) as RInvoice[]);
        setCustomers((c.data ?? []) as RCustomer[]);
        setStaff((s.data ?? []) as RStaff[]);
      } catch (err) {
        console.error('ReportsPage: failed to load reports', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Revenue events: canonical cash-basis definition (lib/metrics.ts), identical to Finance and Overview
  const revenueEvents = useMemo(() => buildRevenueEvents(invoices, bookings), [invoices, bookings]);

  const snapshot = (r: { start: Date; end: Date }): Snapshot => {
    const done = bookings.filter((x) => isDone(x) && inRange(doneAt(x), r));
    return {
      revenue: revenueEvents.filter((e) => inRange(e.at, r)).reduce((s, e) => s + e.amount, 0),
      completed: done.length,
      paid: done.filter((x) => x.payment_status === 'paid').length,
      bookings: bookings.filter((x) => inRange(x.created_at, r)).length,
      newCustomers: customers.filter((x) => inRange(x.created_at, r)).length,
    };
  };

  const cmp: PeriodComparison = useMemo(() => getComparisonRanges(kind), [kind]);
  const cur = useMemo(() => snapshot(cmp.current), [cmp, bookings, invoices, customers]);
  const prev = useMemo(() => snapshot(cmp.previous), [cmp, bookings, invoices, customers]);
  const matrix = useMemo(
    () => KIND_OPTIONS.map((o) => {
      const c = getComparisonRanges(o.id);
      const a = snapshot(c.current);
      const p = snapshot(c.previous);
      return { kind: o.id, label: KIND_LABEL[o.id], ...a, change: pctChange(a.revenue, p.revenue) };
    }),
    [bookings, invoices, customers]
  );

  const trend = useMemo(() => {
    const buckets = buildBuckets(cmp.current);
    const prevBuckets = buildBuckets(cmp.previous, undefined, cmp.previous.end);
    const rev = sumIntoBuckets(buckets, revenueEvents, (e) => e.at, (e) => e.amount);
    const done = sumIntoBuckets(buckets, bookings.filter(isDone), doneAt, () => 1);
    const created = sumIntoBuckets(buckets, bookings, (x) => x.created_at, () => 1);
    const prevRev = sumIntoBuckets(prevBuckets, revenueEvents, (e) => e.at, (e) => e.amount);
    return { buckets, rev, done, created, prevRev: buckets.map((_, i) => prevRev[i] ?? 0) };
  }, [cmp, revenueEvents, bookings]);

  // Funnel cohort: bookings scheduled inside the period, followed to completion and payment
  const funnel = useMemo(() => {
    const cohort = bookings.filter((x) => inRange(x.scheduled_at, cmp.current));
    const done = cohort.filter(isDone);
    return { total: cohort.length, done: done.length, paid: done.filter((x) => x.payment_status === 'paid').length };
  }, [bookings, cmp]);

  const services = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number }>();
    for (const b of bookings.filter((x) => isDone(x) && inRange(doneAt(x), cmp.current))) {
      const name = serviceName(b);
      if (!name) continue;
      const row = map.get(name) ?? { name, count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += bookingValue(b);
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [bookings, cmp]);

  const techs = useMemo(() => {
    const jobs = new Map<string, { jobs: number; done: number }>();
    for (const b of bookings) {
      const name = b.staff?.full_name;
      if (!name) continue;
      const r = jobs.get(name) ?? { jobs: 0, done: 0 };
      r.jobs += 1;
      if (isDone(b)) r.done += 1;
      jobs.set(name, r);
    }
    return staff
      .map((s) => ({ name: s.full_name, workload: Number(s.workload_pct ?? 0), jobs: jobs.get(s.full_name)?.jobs ?? 0, done: jobs.get(s.full_name)?.done ?? 0 }))
      .sort((a, b) => b.done - a.done);
  }, [bookings, staff]);

  const heat = useMemo(() => {
    const grid = DAYS.map(() => SLOT_COLS.map(() => 0));
    for (const b of bookings) {
      const d = new Date(b.scheduled_at);
      if (Number.isNaN(d.getTime())) continue;
      const day = (d.getDay() + 6) % 7;
      const slot = Math.min(SLOT_COLS.length - 1, Math.max(0, Math.floor((d.getHours() - 8) / 2)));
      grid[day][slot] += 1;
    }
    return grid;
  }, [bookings]);

  const extra = useMemo(() => {
    const completed = bookings.filter((x) => x.completed_at && x.scheduled_at);
    const turnaround = completed.length
      ? completed.reduce((s, x) => s + (new Date(x.completed_at!).getTime() - new Date(x.scheduled_at).getTime()), 0) / completed.length / 86400000
      : 0;
    const repeat = customers.filter((c) => c.visit_count > 1).length;
    return {
      avgTurnaroundDays: Math.round(turnaround * 10) / 10,
      repeat,
      repeatRate: customers.length ? repeat / customers.length : 0,
    };
  }, [bookings, customers]);

  const servicesTotal = services.reduce((s, x) => s + x.revenue, 0);
  const insights = useMemo(() => diagnoseReports({
    periodLabel: KIND_LABEL[kind],
    revenue: cur.revenue,
    revenueChangePct: pctChange(cur.revenue, prev.revenue),
    completed: funnel.done,
    paid: funnel.paid,
    bookings: funnel.total,
    topService: services[0] && servicesTotal > 0 ? { name: services[0].name, share: services[0].revenue / servicesTotal } : undefined,
    repeatRate: extra.repeatRate,
    totalCustomers: customers.length,
    avgTurnaroundDays: extra.avgTurnaroundDays,
    techs: techs.map((t) => ({ name: t.name, workload: t.workload })),
  }), [kind, cur, prev, funnel, services, servicesTotal, extra, customers.length, techs]);

  const dir = (pct: number | null): 'up' | 'down' | 'flat' => (pct === null || pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down');
  const revChange = pctChange(cur.revenue, prev.revenue);
  const avgCheck = Math.round(averageCheck(completedIn(bookings, cmp.current)));

  const exportCSV = () => {
    const rows = [
      ['Период', 'Завершено', 'Выручка', 'Новые клиенты', 'Бронирования', 'Δ выручки %'],
      ...matrix.map((m) => [m.label, m.completed, m.revenue, m.newCustomers, m.bookings, m.change === null ? '' : m.change.toFixed(1)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reports.csv';
    a.click();
    toast('Отчёт экспортирован');
  };

  if (loading) return <div className="empty-state">Формирование отчётов...</div>;

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Аналитика</div>
          <h1 className="page-title">Отчёты</h1>
          <p className="page-sub">Операционные, финансовые и клиентские метрики студии · локальные данные.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle visible={showCharts} onToggle={toggleCharts} />
          <div className="tag ghost" onClick={exportCSV}>Экспорт CSV</div>
        </div>
      </div>

      {showCharts && (
      <div className="dx">
        <div className="dx-toolbar">
          <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} ariaLabel="Период отчёта" />
        </div>

        {showCharts && (<>
        {/* Hero: revenue trend */}
        <div className="dx-card">
          <div className="dx-card-head">
            <div><div className="dx-eyebrow">Выручка · {cmp.label.toLowerCase()}</div></div>
            <span className={`ch-delta is-${dir(revChange)}`}>{fmtDelta(revChange)}{revChange === null ? '' : ` к ${cmp.previousLabel.toLowerCase()}`}</span>
          </div>
          <div className="dx-bignum">{cur.revenue.toLocaleString('ru-RU')}<small>₽</small></div>
          <div className="dx-hero-line">
            <span>{cmp.previousLabel}: <b style={{ color: 'var(--text)' }}>{fmt(prev.revenue)}</b></span>
            {cur.completed > 0 && <span>· Средний чек: <b style={{ color: 'var(--text)' }}>{fmt(avgCheck)}</b></span>}
          </div>
          <AreaChart
            ariaLabel="Выручка за период"
            labels={trend.buckets.map((b) => b.label)}
            longLabels={trend.buckets.map((b) => b.long)}
            format={fmt}
            axisFormat={fmtMoneyCompact}
            series={[
              { id: 'rev', label: 'Выручка', values: trend.rev, color: TINT.blue, area: true },
              { id: 'prev', label: cmp.previousLabel, values: trend.prevRev, color: TINT.gray, dashed: true },
            ]}
          />
        </div>

        </>)}

        <div className="dx-grid dx-4">
          <MetricTile label="Завершено" value={cur.completed} delta={fmtDelta(pctChange(cur.completed, prev.completed))} deltaTone={dir(pctChange(cur.completed, prev.completed))} note="работ за период" spark={showCharts ? trend.done : undefined} color={TINT.green} />
          <MetricTile label="Бронирования" value={cur.bookings} delta={fmtDelta(pctChange(cur.bookings, prev.bookings))} deltaTone={dir(pctChange(cur.bookings, prev.bookings))} note="создано за период" spark={showCharts ? trend.created : undefined} color={TINT.orange} />
          <MetricTile label="Новые клиенты" value={cur.newCustomers} delta={fmtDelta(pctChange(cur.newCustomers, prev.newCustomers))} deltaTone={dir(pctChange(cur.newCustomers, prev.newCustomers))} note={`было ${prev.newCustomers}`} color={TINT.purple} />
          <MetricTile label="Средний срок" value={`${String(extra.avgTurnaroundDays).replace('.', ',')} дн.`} note="от записи до готовности" color={TINT.teal} />
        </div>

        {showCharts && (<>
        <div className="dx-card">
          <div className="dx-card-head">
            <div><div className="dx-eyebrow">Диагностика</div><div className="dx-title">Что видно в отчётах</div></div>
            <InsightSummary insights={insights} />
          </div>
          <Insights insights={insights} />
        </div>

        <div className="dx-grid dx-2">
          <div className="dx-card">
            <div className="dx-card-head"><div><div className="dx-eyebrow">Воронка</div><div className="dx-title">От брони до оплаты</div></div></div>
            <Funnel
              emptyText="За период нет броней"
              steps={[
                { id: 'created', label: 'Записано на период', value: funnel.total, color: TINT.blue },
                { id: 'done', label: 'Доведено до конца', value: funnel.done, color: TINT.green },
                { id: 'paid', label: 'Оплачено', value: funnel.paid, color: TINT.teal },
              ]}
            />
            <div className="dx-note">Считаются брони, назначенные на выбранный период, и что с ними стало дальше.</div>
          </div>

          <div className="dx-card">
            <div className="dx-card-head"><div><div className="dx-eyebrow">Структура</div><div className="dx-title">Выручка по услугам</div></div></div>
            <DonutChart
              centerValue={fmtCompact(servicesTotal)}
              centerLabel="выполнено, ₽"
              emptyText="Нет завершённых работ"
              segments={services.map((s, i) => ({ id: s.name, label: s.name, value: s.revenue, color: colorAt(i), display: fmtMoneyCompact(s.revenue) }))}
            />
          </div>
        </div>

        <div className="dx-grid dx-2">
          <div className="dx-card">
            <div className="dx-card-head"><div><div className="dx-eyebrow">Спрос</div><div className="dx-title">Популярные услуги</div></div></div>
            <BarList
              emptyText="Нет данных за период"
              items={[...services].sort((a, b) => b.count - a.count).slice(0, 6).map((s, i) => ({
                id: s.name,
                label: s.name,
                value: s.count,
                display: `${s.count} зак.`,
                color: colorAt(i),
                sub: `выручка ${fmt(s.revenue)}`,
              }))}
            />
          </div>

          <div className="dx-card">
            <div className="dx-card-head"><div><div className="dx-eyebrow">Загрузка</div><div className="dx-title">Когда студия занята</div></div></div>
            <Heatmap rows={DAYS} cols={SLOT_COLS} values={heat} />
            <div className="dx-note">Начало записи по дням недели и двухчасовым слотам (с 8:00), все брони.</div>
          </div>
        </div>

        <div className="dx-grid dx-7-5">
          <div className="dx-card">
            <div className="dx-card-head"><div><div className="dx-eyebrow">Команда</div><div className="dx-title">Производительность техников</div></div></div>
            {techs.length === 0 && <div className="ch-empty-block">Нет сотрудников</div>}
            {techs.map((t) => {
              const ratio = t.jobs ? t.done / t.jobs : 0;
              return (
                <div className="dx-tech" key={t.name}>
                  <ActivityRings
                    size={76}
                    stroke={8}
                    legend={false}
                    rings={[
                      { id: 'done', label: 'Завершено', value: ratio, display: `${Math.round(ratio * 100)}%`, color: TINT.green, unknown: t.jobs === 0 },
                      { id: 'load', label: 'Загрузка', value: t.workload / 100, display: `${t.workload}%`, color: t.workload >= 90 ? TINT.red : TINT.blue },
                    ]}
                  />
                  <div className="dx-tech-info">
                    <div className="dx-tech-name">{t.name}</div>
                    <div className="dx-tech-sub">{t.done} завершено · {t.jobs} всего</div>
                    <div className="dx-chips">
                      <span className={`ch-badge is-${t.workload >= 90 ? 'red' : t.workload >= 50 ? 'blue' : 'gray'}`}>загрузка {t.workload}%</span>
                      {t.jobs > 0 && <span className="ch-badge is-green">выполнено {Math.round(ratio * 100)}%</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dx-card">
            <div className="dx-card-head"><div><div className="dx-eyebrow">Клиенты</div><div className="dx-title">Возвращаемость</div></div></div>
            <ActivityRings
              size={150}
              stroke={16}
              rings={[{ id: 'repeat', label: 'Повторные клиенты', hint: `${extra.repeat} из ${customers.length}, 2+ визита`, value: extra.repeatRate, display: `${Math.round(extra.repeatRate * 100)}%`, color: TINT.purple, unknown: customers.length === 0 }]}
              center={<><b>{Math.round(extra.repeatRate * 100)}%</b><span>повторные</span></>}
            />
          </div>
        </div>

        </>)}

        <div className="dx-card">
          <div className="dx-card-head"><div><div className="dx-eyebrow">Сводка</div><div className="dx-title">Все периоды рядом</div></div></div>
          <div className="dx-scroll-x">
            <table className="dx-matrix">
              <thead>
                <tr><th>Период</th><th>Выручка</th><th>Δ</th><th>Завершено</th><th>Новые клиенты</th><th>Брони</th></tr>
              </thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.kind} className={m.kind === kind ? 'is-on' : ''}>
                    <td>{m.label}</td>
                    <td>{fmt(m.revenue)}</td>
                    <td style={{ color: m.change === null || m.change === 0 ? undefined : m.change > 0 ? 'var(--c-green)' : 'var(--c-red)' }}>{fmtDelta(m.change)}</td>
                    <td>{m.completed}</td>
                    <td>{m.newCustomers}</td>
                    <td>{m.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ReconciliationPanel />
      </div>
      )}
      <AccountingReport />
    </>
  );
}
