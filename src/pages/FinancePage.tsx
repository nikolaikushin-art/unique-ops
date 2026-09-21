import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { Pencil, Trash2 } from 'lucide-react';
import { useLocalQuery } from '../hooks/useLocalData';
import { useFinanceAnalytics, type FinanceFilters } from '../hooks/useFinanceAnalytics';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { canManageFinance, isAdmin } from '../lib/permissions';
import { db, type Row } from '../lib/localdb';
import { fmt, INVOICE_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/constants';
import { invoiceCustomerEmail, sendInvoiceToCustomer } from '../lib/invoices';
import { invoiceBalance, invoicePaidAmount, isInvoiceOverdue, type MetricInvoice } from '../lib/metrics';
import { PAYMENT_METHOD_LABELS, recordPayment, revertPayment } from '../lib/ledger';
import { createOrderAndInvoice } from '../lib/orderFlow';
import { printInvoiceDocument } from '../lib/documents';
import { Modal, Field, SelectField } from '../components/Modal';
import { ClientMessageModal, type MessageTarget } from '../components/ClientMessageModal';
import type { PaymentMethod } from '../types/database';
import { FINANCE_PERIOD_LABELS, type FinancePeriod } from '../lib/analytics';
import { PeriodSelector } from '../components/dashboard/PeriodSelector';
import {
  ActivityRings,
  AreaChart,
  BarList,
  DonutChart,
  InsightSummary,
  Insights,
  MetricTile,
  StorageBar,
  TINT,
  colorAt,
  fmtCompact,
  fmtDelta,
  fmtMoneyCompact,
  type BarItem,
} from '../components/charts';
import { diagnoseFinance, overdueInvoices } from '../lib/diagnostics';
import type { Invoice, Order, Booking, Service, Staff, Customer, Vehicle, InventoryItem } from '../types/database';

const EMPTY_FILTERS: FinanceFilters = {
  dateFrom: '',
  dateTo: '',
  serviceId: '',
  employeeId: '',
  customerId: '',
  vehicleId: '',
  productId: '',
};

export function FinancePage({ onEdit }: { onEdit: (inv: Invoice | null) => void }) {
  const { data: invoices, remove, refetch } = useLocalQuery<Invoice>('invoices', '*, customers(*)', { orderBy: 'created_at' });
  const { data: services } = useLocalQuery<Service>('services', 'id, name');
  const { data: staffList } = useLocalQuery<Staff>('staff', 'id, full_name');
  const { data: customers } = useLocalQuery<Customer>('customers', 'id, full_name');
  const { data: vehicles } = useLocalQuery<Vehicle>('vehicles', 'id, brand, model, registration_number');
  const { data: products } = useLocalQuery<InventoryItem>('inventory_items', 'id, name, type');

  const [period, setPeriod] = useState<FinancePeriod>('monthly');
  const [filters, setFilters] = useState<FinanceFilters>(EMPTY_FILTERS);
  const { metrics, loading: analyticsLoading } = useFinanceAnalytics(period, filters);

  const { toast } = useToast();
  const { profile } = useAuth();
  const { refresh } = useDataRefresh();
  const canManage = canManageFinance(profile?.role);
  const canDelete = isAdmin(profile?.role);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState<{ amount: string; method: PaymentMethod; note: string }>({ amount: '', method: 'card', note: '' });
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showCharts, toggleCharts] = useAnalyticsVisibility('finance');

  const setFilter = (key: keyof FinanceFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const loadOrders = useCallback(() => {
    db.from('orders').select('*, customers(full_name)').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, []);

  const loadPendingBookings = useCallback(async () => {
    const { data: bookings } = await db
      .from('bookings')
      .select('*, customers(full_name), services(name, price)')
      .in('status', ['completed', 'delivered'])
      .order('scheduled_at', { ascending: false })
      .limit(20);
    const { data: existing } = await db.from('orders').select('booking_id').not('booking_id', 'is', null);
    const used = new Set((existing ?? []).map((o: Row) => o.booking_id));
    setPendingBookings(((bookings as Booking[]) ?? []).filter((b) => !used.has(b.id)));
  }, []);

  useEffect(() => {
    loadOrders();
    loadPendingBookings();
  }, [loadOrders, loadPendingBookings]);

  /** One click: order + invoice, joined by real ids; a deposit paid at booking time becomes the first payment. */
  const createOrder = async (bookingId: string) => {
    const r = await createOrderAndInvoice(bookingId);
    if (r.error) {
      toast('Ошибка: ' + r.error);
      return;
    }
    toast(r.created.invoice ? 'Заказ и счёт созданы' : r.created.order ? 'Заказ создан' : 'Заказ и счёт уже существуют');
    loadOrders();
    loadPendingBookings();
    await refetch();
    refresh();
  };

  const sendInvoiceEmail = async (inv: Invoice) => {
    if (!canManage || sendingId) return;
    const email = invoiceCustomerEmail(inv);
    if (!email) {
      toast('У клиента не указан email');
      return;
    }
    setSendingId(inv.id);
    try {
      const result = await sendInvoiceToCustomer(inv.id);
      if (!result.ok) {
        toast('Ошибка: ' + (result.error || 'Не удалось отправить'));
        return;
      }
      toast(result.message || `Счёт отправлен на ${email}`);
      await refetch();
      refresh();
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message);
    } finally {
      setSendingId(null);
    }
  };

  /**
   * The invoice is what WE issue to the client — the client pays it. Staff never "pay" it: they RECORD money
   * received (cash / card / transfer), in one go or in parts. Status and booking payment state follow the ledger.
   */
  const openPay = (inv: Invoice) => {
    if (!canManage) return;
    setPayTarget(inv);
    setPayForm({ amount: String(invoiceBalance(inv as unknown as MetricInvoice)), method: 'card', note: '' });
  };

  const submitPay = async () => {
    if (!payTarget) return;
    const res = await recordPayment(payTarget, { amount: Number(String(payForm.amount).replace(/\s/g, '').replace(',', '.')), method: payForm.method, note: payForm.note });
    if (res.error) { toast(res.error); return; }
    toast(res.invoice?.status === 'paid' ? `Счёт ${payTarget.invoice_number} оплачен полностью` : `Оплата принята · остаток ${fmt(invoiceBalance(res.invoice as unknown as MetricInvoice))}`);
    setPayTarget(null);
    await refetch();
    refresh();
  };

  const undoPayment = async (inv: Invoice, paymentId: string) => {
    if (!canDelete || !window.confirm('Отменить этот платёж? Он будет удалён из журнала счёта.')) return;
    const r = await revertPayment(inv, paymentId);
    if (r.error) toast('Ошибка: ' + r.error);
    else { toast('Платёж отменён'); await refetch(); refresh(); }
  };

  const printDoc = async (kind: 'invoice' | 'act', id: string) => {
    const err = await printInvoiceDocument(kind, id);
    if (err) toast(err);
  };

  /** Cash desk: what was received today, by method (from the invoices' payment ledgers). */
  const cashToday = useMemo(() => {
    const day = new Date().toDateString();
    const rows: { inv: Invoice; method: PaymentMethod; amount: number; at: string }[] = [];
    for (const inv of invoices) for (const p of inv.payments ?? []) if (new Date(p.at).toDateString() === day) rows.push({ inv, method: p.method, amount: p.amount, at: p.at });
    const byMethod = new Map<PaymentMethod, number>();
    for (const r of rows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount);
    return { rows: rows.sort((a, b) => b.at.localeCompare(a.at)), byMethod, total: rows.reduce((sum, r) => sum + r.amount, 0) };
  }, [invoices]);

  const statusClass = (s: string) => s === 'paid' ? 'done' : s === 'overdue' ? 'progress' : 'planned';

  const materialProducts = useMemo(() => products.filter((p) => p.type === 'material' || p.type === 'product'), [products]);

  const activeFilters = useMemo(
    () => (['dateFrom', 'serviceId', 'employeeId', 'customerId', 'vehicleId', 'productId'] as const).filter((k) => filters[k]).length + (filters.dateTo && !filters.dateFrom ? 1 : 0),
    [filters]
  );

  const trend = metrics.trendBuckets;
  const hasExpenses = metrics.expenses > 0;
  const periodLabel = filters.dateFrom && filters.dateTo ? 'Свой период' : FINANCE_PERIOD_LABELS[period];

  const overdue = useMemo(() => overdueInvoices(invoices), [invoices]);
  const insights = useMemo(
    () => diagnoseFinance({ metrics, invoices, pendingBookings: pendingBookings.length, ordersCount: orders.length }),
    [metrics, invoices, pendingBookings.length, orders.length]
  );

  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const onInsightAction = (actionId: string) => {
    if (actionId === 'orders') goTo(pendingBookings.length ? 'fin-bookings' : 'fin-orders');
    else if (actionId === 'invoices') goTo('fin-invoices');
  };

  // Rings — three honest ratios, each one 0…1
  const rings = useMemo(() => {
    const collectDen = metrics.revenue + metrics.outstanding;
    const collect = collectDen > 0 ? metrics.revenue / collectDen : 1;
    const marginKnown = metrics.revenue > 0 && metrics.expenses > 0;
    const orderDen = orders.length + pendingBookings.length;
    const ordered = orderDen > 0 ? orders.length / orderDen : 1;
    const list = [
      { id: 'collect', label: 'Оплачено', hint: 'выручка из всего к получению', value: collect, display: `${Math.round(collect * 100)}%`, color: TINT.green, unknown: collectDen === 0 },
      { id: 'margin', label: 'Маржа', hint: 'чистая, после расходов', value: Math.max(0, metrics.netMargin) / 100, display: `${Math.round(metrics.netMargin)}%`, color: TINT.blue, unknown: !marginKnown },
      { id: 'orders', label: 'Заказы', hint: 'брони оформлены в заказ', value: ordered, display: `${Math.round(ordered * 100)}%`, color: TINT.orange, unknown: orderDen === 0 },
    ];
    const known = list.filter((r) => !r.unknown);
    const score = known.length ? Math.round((known.reduce((s, r) => s + Math.min(1, r.value), 0) / known.length) * 100) : null;
    return { list, score };
  }, [metrics, orders.length, pendingBookings.length]);

  const totalJobs = metrics.serviceBreakdown.reduce((s, x) => s + x.count, 0);
  const revSpark = trend.map((b) => b.revenue);
  const expSpark = trend.map((b) => b.expenses);
  const profitSpark = trend.map((b) => b.profit);
  const marginSpark = trend.map((b) => (b.revenue > 0 && b.expenses > 0 ? (b.profit / b.revenue) * 100 : 0));

  const tone = (pct: number | null, invert = false): 'up' | 'down' | 'flat' => {
    if (pct === null || pct === 0) return 'flat';
    return (pct > 0) !== invert ? 'up' : 'down';
  };

  // Receivables ageing + top debtors
  const receivables = useMemo(() => {
    const now = Date.now();
    const buckets = { current: 0, nodue: 0, d7: 0, d30: 0, d30p: 0 };
    const byCustomer = new Map<string, { name: string; sum: number; late: boolean }>();
    for (const inv of invoices) {
      if (inv.status === 'paid') continue;
      const amount = Number(inv.amount);
      let late = false;
      if (!inv.due_date) buckets.nodue += amount;
      else {
        const days = Math.floor((now - new Date(inv.due_date).getTime()) / 86400000);
        if (days <= 0) buckets.current += amount;
        else { late = true; if (days <= 7) buckets.d7 += amount; else if (days <= 30) buckets.d30 += amount; else buckets.d30p += amount; }
      }
      if (inv.status === 'overdue') late = true;
      const name = inv.customers?.full_name ?? 'Без клиента';
      const row = byCustomer.get(inv.customer_id) ?? { name, sum: 0, late: false };
      row.sum += amount;
      row.late = row.late || late;
      byCustomer.set(inv.customer_id, row);
    }
    const debtors: BarItem[] = [...byCustomer.entries()]
      .sort((a, b) => b[1].sum - a[1].sum)
      .slice(0, 5)
      .map(([id, r]) => ({ id, label: r.name, value: r.sum, display: fmt(r.sum), color: r.late ? TINT.red : TINT.teal, badge: r.late ? { text: 'просрочено', tone: 'red' as const } : undefined }));
    return { buckets, debtors };
  }, [invoices]);

  const profitability: BarItem[] = metrics.serviceBreakdown.map((s) => {
    const margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
    const real = s.costSource === 'recipe';
    return {
      id: s.id,
      label: s.name,
      value: Math.max(s.profit, 0),
      secondary: s.revenue,
      display: fmt(s.revenue),
      color: real ? (margin >= 50 ? TINT.green : margin >= 25 ? TINT.orange : TINT.red) : TINT.gray,
      badge: real
        ? { text: `${Math.round(margin)}%`, tone: margin >= 50 ? 'green' : margin >= 25 ? 'orange' : 'red' }
        : { text: '≈ оценка', tone: 'gray' },
      sub: <>{s.count} {s.count === 1 ? 'работа' : 'работ'} · прибыль {fmt(Math.round(s.profit))} · {real ? 'себестоимость по рецептуре материалов' : 'себестоимость не задана — условно 70%'}</>,
    };
  });

  return (
    <div className="finance-page">
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Финансы</div>
          <h1 className="page-title">Финансы</h1>
          <p className="page-sub">Внутренний учёт: выручка, расходы, маржа, тренды и счета.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle visible={showCharts} onToggle={toggleCharts} />
          {canManage && <div className="tag add" onClick={() => onEdit(null)}>+ Новый счёт</div>}
        </div>
      </div>

      <div className="dx">
        {showCharts && (<>
        <div className="dx-toolbar">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        <div className="dx-filters">
          <div className="dx-filters-head" onClick={() => setFiltersOpen((v) => !v)}>
            <span className="dx-filters-title">
              Фильтры
              {activeFilters > 0 && <span className="dx-filters-count">{activeFilters}</span>}
            </span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {activeFilters > 0 && (
                <button type="button" className="dx-link" onClick={(e) => { e.stopPropagation(); setFilters(EMPTY_FILTERS); }}>Сбросить</button>
              )}
              <span className="dx-link">{filtersOpen ? 'Скрыть' : 'Показать'}</span>
            </span>
          </div>
          {filtersOpen && (
            <div className="dx-filters-body">
              <div className="dx-filters-dates">
                <div>
                  <label className="field-label">Дата с</label>
                  <input type="date" className="field-input" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Дата по</label>
                  <input type="date" className="field-input" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} />
                </div>
              </div>
              <div className="dx-filters-row">
                <select className="field-select" value={filters.serviceId} onChange={(e) => setFilter('serviceId', e.target.value)}>
                  <option value="">Все услуги</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="field-select" value={filters.employeeId} onChange={(e) => setFilter('employeeId', e.target.value)}>
                  <option value="">Все сотрудники</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
                <select className="field-select" value={filters.customerId} onChange={(e) => setFilter('customerId', e.target.value)}>
                  <option value="">Все клиенты</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
                <select className="field-select" value={filters.vehicleId} onChange={(e) => setFilter('vehicleId', e.target.value)}>
                  <option value="">Все автомобили</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number || `${v.brand} ${v.model}`}</option>)}
                </select>
                <select className="field-select" value={filters.productId} onChange={(e) => setFilter('productId', e.target.value)}>
                  <option value="">Все материалы</option>
                  {materialProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {analyticsLoading ? (
          <div className="dx-card"><div className="empty-state">Расчёт метрик…</div></div>
        ) : (
          <>
            {showCharts && (
            <>
            {/* HERO: revenue trend + health rings */}
            <div className="dx-grid dx-hero">
              <div className="dx-card">
                <div className="dx-card-head">
                  <div>
                    <div className="dx-eyebrow">Выручка · {periodLabel.toLowerCase()}</div>
                  </div>
                  <span className={`ch-delta is-${tone(metrics.vsPrevious.revenueChangePct)}`}>
                    {fmtDelta(metrics.vsPrevious.revenueChangePct)}{metrics.vsPrevious.revenueChangePct === null ? '' : ' к прошлому периоду'}
                  </span>
                </div>
                <div className="dx-bignum">{metrics.revenue.toLocaleString('ru-RU')}<small>₽</small></div>
                <div className="dx-hero-line">
                  <span>Прошлый период: <b style={{ color: 'var(--text)' }}>{fmt(metrics.vsPrevious.revenue)}</b></span>
                  {metrics.outstanding > 0 && <span>· К получению: <b style={{ color: 'var(--text)' }}>{fmt(metrics.outstanding)}</b></span>}
                </div>
                <AreaChart
                  ariaLabel="Выручка и расходы по периоду"
                  labels={trend.map((b) => b.label)}
                  longLabels={trend.map((b) => b.long)}
                  format={fmt}
                  axisFormat={fmtMoneyCompact}
                  series={[
                    { id: 'revenue', label: 'Выручка', values: revSpark, color: TINT.blue, area: true },
                    ...(hasExpenses ? [{ id: 'expenses', label: 'Расходы', values: expSpark, color: TINT.orange }] : []),
                    ...(hasExpenses ? [{ id: 'profit', label: 'Прибыль', values: profitSpark, color: TINT.green }] : []),
                    { id: 'prev', label: 'Прошлый период', values: trend.map((b) => b.prevRevenue), color: TINT.gray, dashed: true },
                  ]}
                  initiallyHidden={hasExpenses ? ['profit'] : []}
                />
              </div>

              <div className="dx-card dx-side">
                <div style={{ width: '100%' }}>
                  <div className="dx-eyebrow">Здоровье финансов</div>
                  <div className="dx-sub" style={{ marginTop: 2 }}>Индекс — среднее известных колец</div>
                </div>
                <ActivityRings
                  rings={rings.list}
                  center={<><b>{rings.score ?? '—'}</b><span>индекс</span></>}
                />
              </div>
            </div>

            </>
            )}

            {/* KPI tiles with sparklines */}
            <div className="dx-grid dx-4">
              <MetricTile
                label="Прибыль"
                value={fmt(metrics.profit)}
                delta={hasExpenses ? fmtDelta(metrics.vsPrevious.profitChangePct) : undefined}
                deltaTone={tone(metrics.vsPrevious.profitChangePct)}
                note={hasExpenses ? undefined : 'расходы пока не учтены'}
                spark={showCharts ? profitSpark : undefined}
                color={TINT.green}
              />
              <MetricTile
                label="Расходы"
                value={fmt(metrics.expenses)}
                delta={hasExpenses ? fmtDelta(metrics.vsPrevious.expensesChangePct) : undefined}
                deltaTone={tone(metrics.vsPrevious.expensesChangePct, true)}
                note={`труд ${fmt(metrics.labourCosts)} · мат. ${fmt(metrics.materialCosts)}`}
                spark={showCharts ? expSpark : undefined}
                color={TINT.orange}
              />
              <MetricTile
                label="Валовая маржа"
                value={hasExpenses ? `${metrics.grossMargin.toFixed(1).replace('.', ',')}%` : 'н/д'}
                note={hasExpenses ? `чистая ${metrics.netMargin.toFixed(1).replace('.', ',')}%` : 'нет данных о расходах'}
                spark={hasExpenses && showCharts ? marginSpark : undefined}
                color={TINT.purple}
              />
              <MetricTile
                label="К оплате"
                value={fmt(metrics.outstanding)}
                note={overdue.length ? `просрочено: ${overdue.length}` : 'просрочек нет'}
                color={overdue.length ? TINT.red : TINT.teal}
                onClick={() => goTo('fin-invoices')}
              />
            </div>

            <div className="dx-grid dx-4">
              <MetricTile label="Завершённые работы" value={fmt(metrics.completedJobsValue)} note={`${totalJobs} шт.`} color={TINT.blue} />
              <MetricTile label="Средний чек" value={totalJobs ? fmt(Math.round(metrics.completedJobsValue / totalJobs)) : '—'} note="по завершённым работам" color={TINT.teal} />
              <MetricTile label="Продажи материалов" value={fmt(metrics.productSales)} color={TINT.purple} />
              <MetricTile label="Себестоимость труда" value={fmt(metrics.labourCosts)} color={TINT.orange} />
            </div>

            {showCharts && (
            <>
            {/* Diagnostics */}
            <div className="dx-card">
              <div className="dx-card-head">
                <div>
                  <div className="dx-eyebrow">Диагностика</div>
                  <div className="dx-title">Что видно в цифрах</div>
                </div>
                <InsightSummary insights={insights} />
              </div>
              <Insights insights={insights} onAction={onInsightAction} />
            </div>

            {/* Structure */}
            <div className="dx-grid dx-2">
              <div className="dx-card">
                <div className="dx-card-head"><div><div className="dx-eyebrow">Структура</div><div className="dx-title">Выручка по услугам</div></div></div>
                <DonutChart
                  centerValue={fmtCompact(metrics.serviceBreakdown.reduce((s, x) => s + x.revenue, 0))}
                  centerLabel="выполнено, ₽"
                  emptyText="Нет завершённых работ"
                  segments={metrics.serviceBreakdown.map((s, i) => ({ id: s.id, label: s.name, value: s.revenue, color: colorAt(i), display: fmtMoneyCompact(s.revenue) }))}
                />
              </div>
              <div className="dx-card">
                <div className="dx-card-head"><div><div className="dx-eyebrow">Структура</div><div className="dx-title">Куда уходят расходы</div></div></div>
                <DonutChart
                  centerValue={fmtCompact(metrics.expenses)}
                  centerLabel="расходы, ₽"
                  emptyText="Расходов нет"
                  segments={[
                    { id: 'labour', label: 'Труд', value: metrics.labourCosts, color: TINT.orange, display: fmtMoneyCompact(metrics.labourCosts) },
                    { id: 'materials', label: 'Материалы', value: metrics.materialCosts, color: TINT.purple, display: fmtMoneyCompact(metrics.materialCosts) },
                    { id: 'usage', label: 'Списание со склада', value: metrics.labourCosts + metrics.materialCosts === 0 ? metrics.expenses : 0, color: TINT.teal, display: fmtMoneyCompact(metrics.expenses) },
                  ]}
                />
                {!hasExpenses && <div className="dx-note">Расходы появятся, когда завершённые брони будут оформлены заказами с трудом и материалами.</div>}
              </div>
            </div>

            {metrics.serviceBreakdown.length > 0 && (
              <div className="dx-card">
                <div className="dx-card-head">
                  <div><div className="dx-eyebrow">Рентабельность</div><div className="dx-title">Прибыль по услугам</div></div>
                  <span className="dx-sub">светлая полоса — выручка, яркая — прибыль</span>
                </div>
                <BarList items={profitability} />
              </div>
            )}

            {/* Receivables */}
            <div className="dx-card">
              <div className="dx-card-head">
                <div><div className="dx-eyebrow">Дебиторка</div><div className="dx-title">Кто нам должен</div></div>
                <div className="dx-bignum" style={{ fontSize: 26 }}>{fmt(metrics.outstanding)}</div>
              </div>
              <StorageBar
                emptyText="Все счета оплачены"
                segments={[
                  { id: 'current', label: 'В срок', value: receivables.buckets.current, color: TINT.teal, display: fmtMoneyCompact(receivables.buckets.current) },
                  { id: 'nodue', label: 'Без срока', value: receivables.buckets.nodue, color: TINT.gray, display: fmtMoneyCompact(receivables.buckets.nodue) },
                  { id: 'd7', label: 'Просрочка до 7 дн.', value: receivables.buckets.d7, color: TINT.yellow, display: fmtMoneyCompact(receivables.buckets.d7) },
                  { id: 'd30', label: '8–30 дн.', value: receivables.buckets.d30, color: TINT.orange, display: fmtMoneyCompact(receivables.buckets.d30) },
                  { id: 'd30p', label: 'Больше 30 дн.', value: receivables.buckets.d30p, color: TINT.red, display: fmtMoneyCompact(receivables.buckets.d30p) },
                ]}
              />
              {receivables.debtors.length > 0 && (
                <div style={{ marginTop: 22 }}>
                  <div className="dx-eyebrow" style={{ marginBottom: 12 }}>Крупнейшие должники</div>
                  <BarList items={receivables.debtors} />
                </div>
              )}
            </div>
            </>
            )}
          </>
        )}

        </>)}

        {canManage && pendingBookings.length > 0 && (
          <div className="dx-card" id="fin-bookings">
            <div className="dx-card-head">
              <div><div className="dx-eyebrow">Ждут оформления</div><div className="dx-title">Завершённые брони → заказы</div></div>
            </div>
            <div className="dx-list">
              {pendingBookings.map((b) => (
                <div className="dx-row" key={b.id}>
                  <div className="dx-row-main">
                    <div className="dx-row-title">{b.customers?.full_name}</div>
                    <div className="dx-row-sub">{b.services?.name ?? 'Услуга'} · {new Date(b.scheduled_at).toLocaleDateString('ru-RU')} · {PAYMENT_STATUS_LABELS[b.payment_status] ?? b.payment_status}</div>
                  </div>
                  <button type="button" className="dx-btn" onClick={() => createOrder(b.id)}>Создать заказ и счёт</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="dx-card" id="fin-orders">
          <div className="dx-card-head"><div><div className="dx-eyebrow">Себестоимость</div><div className="dx-title">Заказы · P&amp;L</div></div></div>
          {orders.length ? (
            <div className="dx-list">
              {orders.map((o) => (
                <div className="dx-row" key={o.id}>
                  <div className="dx-row-main">
                    <div className="dx-row-title">{o.customers?.full_name}</div>
                    <div className="dx-row-sub">{o.order_number} · Труд {fmt(Number(o.labour_cost ?? 0))} · Мат. {fmt(Number(o.materials_cost ?? 0))}</div>
                  </div>
                  <div className="invoice-amount">{fmt(Number(o.total_amount))}</div>
                </div>
              ))}
            </div>
          ) : <div className="ch-empty-block">Заказов нет. Создайте заказ из завершённой брони.</div>}
        </div>

        <div className="dx-card" id="fin-cash">
          <div className="dx-card-head">
            <div><div className="dx-eyebrow">Касса</div><div className="dx-title">Получено сегодня</div></div>
            <span className="ch-badge is-gray">{fmt(cashToday.total)}</span>
          </div>
          {cashToday.rows.length === 0 && <div className="ch-empty-block">Сегодня оплат ещё не было. Оплаты фиксируются кнопкой «Принять оплату» в счёте.</div>}
          {cashToday.rows.length > 0 && (
            <>
              <div className="tag-row" style={{ marginBottom: 10 }}>
                {[...cashToday.byMethod.entries()].map(([m, amt]) => <span key={m} className="ch-badge is-gray">{PAYMENT_METHOD_LABELS[m]}: {fmt(amt)}</span>)}
              </div>
              <div className="dx-list">
                {cashToday.rows.map((r, i) => (
                  <div className="dx-row" key={r.inv.id + i}>
                    <div className="dx-row-main">
                      <div className="dx-row-title">{r.inv.customers?.full_name}</div>
                      <div className="dx-row-sub">{r.inv.invoice_number} · {PAYMENT_METHOD_LABELS[r.method]} · {new Date(r.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="invoice-amount">{fmt(r.amount)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="dx-card" id="fin-invoices">
          <div className="dx-card-head"><div><div className="dx-eyebrow">Оплата</div><div className="dx-title">Счета</div></div></div>
          {invoices.length ? (
            <div className="finance-list">
              {invoices.map((inv) => {
                const mi = inv as unknown as MetricInvoice;
                const paid = invoicePaidAmount(mi);
                const balance = invoiceBalance(mi);
                const isPaid = inv.status === 'paid';
                const shownStatus = isPaid ? 'paid' : isInvoiceOverdue(mi) ? 'overdue' : 'pending';
                const partial = !isPaid && paid > 0;
                return (
                <div className="invoice-row" key={inv.id}>
                  <div>
                    <div className="cell-title">{inv.customers?.full_name}</div>
                    <div className="cell-sub">
                      {inv.invoice_number} · {inv.description}{inv.due_date ? ` · до ${new Date(inv.due_date).toLocaleDateString('ru-RU')}` : ''}
                      {inv.sent_at && ` · отправлен ${new Date(inv.sent_at).toLocaleDateString('ru-RU')} → ${inv.last_sent_to}`}
                      {isPaid && inv.paid_at && ` · оплачен ${new Date(inv.paid_at).toLocaleDateString('ru-RU')}`}
                      {partial && ` · оплачено ${fmt(paid)}, остаток ${fmt(balance)}`}
                    </div>
                    {(inv.payments ?? []).length > 0 && (
                      <div className="cell-sub" style={{ marginTop: 2 }}>
                        {(inv.payments ?? []).map((p) => (
                          <span key={p.id} style={{ marginRight: 10 }}>
                            {new Date(p.at).toLocaleDateString('ru-RU')} · {PAYMENT_METHOD_LABELS[p.method]} · {fmt(p.amount)}
                            {canDelete && <span style={{ cursor: 'pointer', color: 'var(--red)', marginLeft: 4 }} title="Отменить платёж" onClick={() => undoPayment(inv, p.id)}>×</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`status-badge ${statusClass(shownStatus)}`} style={{ width: 'fit-content' }}>{partial ? 'Частично оплачен' : INVOICE_STATUS_LABELS[shownStatus]}</div>
                  <div className="invoice-amount">{fmt(Number(inv.amount))}</div>
                  <div className="icon-actions">
                    {canManage && !isPaid && (
                      <div className="tag add tag--emphasis" title="Клиент заплатил (наличные, карта, перевод) — записать поступление" onClick={() => openPay(inv)}>
                        Принять оплату
                      </div>
                    )}
                    {canManage && !isPaid && (
                      <div className="tag add" title="Написать клиенту напоминание об оплате" onClick={() => setMsgTarget({ customerId: inv.customer_id, invoiceId: inv.id, bookingId: inv.booking_id, template: shownStatus === 'overdue' ? 'payment_reminder' : 'invoice' })}>
                        {shownStatus === 'overdue' ? 'Напомнить' : 'Написать'}
                      </div>
                    )}
                    <div className="tag add" title="Печать счёта / сохранить в PDF" onClick={() => printDoc('invoice', inv.id)}>Счёт PDF</div>
                    <div className="tag add" title="Акт выполненных работ" onClick={() => printDoc('act', inv.id)}>Акт</div>
                    {canManage && (
                      <div
                        className="tag add"
                        style={{ opacity: invoiceCustomerEmail(inv) ? 1 : 0.45, cursor: invoiceCustomerEmail(inv) ? 'pointer' : 'not-allowed' }}
                        title={invoiceCustomerEmail(inv) ? `Отправить на ${invoiceCustomerEmail(inv)}` : 'У клиента нет email'}
                        onClick={() => sendInvoiceEmail(inv)}
                      >
                        {sendingId === inv.id ? 'Отправка…' : 'Email'}
                      </div>
                    )}
                    {canManage && <span className="icon-btn" onClick={() => onEdit(inv)}><Pencil size={13} strokeWidth={1.75} /></span>}
                    {canDelete && <span className="icon-btn danger" onClick={async () => {
                      const err = await remove(inv.id);
                      if (err) toast('Ошибка: ' + err);
                      else toast('Удалён');
                    }}><Trash2 size={13} strokeWidth={1.75} /></span>}
                  </div>
                </div>
                );
              })}
            </div>
          ) : <div className="ch-empty-block">Счетов нет.</div>}
        </div>
      </div>
      <Modal open={!!payTarget} title={payTarget ? `Принять оплату · ${payTarget.invoice_number}` : ''} onClose={() => setPayTarget(null)} onSave={submitPay} saveLabel="Записать оплату">
        {payTarget && (
          <>
            <div className="settings-hint" style={{ marginBottom: 12 }}>
              {payTarget.customers?.full_name} · счёт на {fmt(Number(payTarget.amount))} · уже оплачено {fmt(invoicePaidAmount(payTarget as unknown as MetricInvoice))} · остаток {fmt(invoiceBalance(payTarget as unknown as MetricInvoice))}
            </div>
            <Field label="Сумма, ₽ (можно частично)" id="pay-amount" type="number" value={payForm.amount} onChange={(v) => setPayForm((f) => ({ ...f, amount: v }))} />
            <SelectField label="Способ" id="pay-method" value={payForm.method} onChange={(v) => setPayForm((f) => ({ ...f, method: v as PaymentMethod }))} options={(['cash', 'card', 'transfer', 'deposit'] as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
            <Field label="Комментарий" id="pay-note" value={payForm.note} onChange={(v) => setPayForm((f) => ({ ...f, note: v }))} />
          </>
        )}
      </Modal>
      <ClientMessageModal target={msgTarget} onClose={() => setMsgTarget(null)} />
    </div>
  );
}
