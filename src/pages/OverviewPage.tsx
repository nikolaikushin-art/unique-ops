import { useMemo, useState } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { useNavigate } from 'react-router-dom';
import { Calendar, Wrench, Users, TrendingUp, Car, Clock, ClipboardList, CarFront, AlarmClock, Wallet, X } from 'lucide-react';
import { useDashboardStats } from '../hooks/useLocalData';
import { useLocalQuery } from '../hooks/useLocalData';
import { useExecutiveMetrics } from '../hooks/useExecutiveMetrics';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { useToast } from '../contexts/ToastContext';
import { SetupBanner } from '../components/SetupBanner';
import { AftercareCard } from '../components/dashboard/AftercareCard';
import { KpiCard, KpiComparison } from '../components/dashboard/KpiCard';
import { PeriodComparisonPanel } from '../components/dashboard/PeriodComparison';
import { WorkflowBoard } from '../components/dashboard/WorkflowBoard';
import { FinanceSnapshot } from '../components/dashboard/FinanceSnapshot';
import { CustomerSnapshot } from '../components/dashboard/CustomerSnapshot';
import { DashboardAlerts, type DashboardAlert } from '../components/dashboard/DashboardAlerts';
import { ShiftClock } from '../components/dashboard/ShiftClock';
import { QuickCounters } from '../components/dashboard/QuickCounters';
import { RingGauge } from '../components/RingGauge';
import { VehicleThumb } from '../components/VehicleThumb';
import { Avatar } from '../components/ui/Avatar';
import {
  fmt,
  fmtTime,
  BOOKING_SELECT,
  JOB_STATUS_LABELS,
  overviewStatusLabel,
  overviewStatusClass,
  vehicleDisplayName,
} from '../lib/constants';
import { nextJobStatus, syncVehicleFromBookingStatus } from '../lib/workflow';
import { canManageBookings, isAdmin, getDashboardView, canAccessView } from '../lib/permissions';
import { useAuth } from '../contexts/AuthContext';
import { useModuleConfig } from '../contexts/ModuleConfigContext';
import type { Booking, Staff, Invoice, Customer, ViewId } from '../types/database';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function bookingTone(status: string): PillTone {
  if (status === 'in_progress') return 'info';
  if (status === 'completed' || status === 'delivered') return 'success';
  if (status === 'awaiting_approval' || status === 'quality_check') return 'warning';
  return 'neutral';
}

const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '') : '—';

function loadLevel(pct: number): { level: 'low' | 'mid' | 'high'; label: string } {
  if (pct >= 80) return { level: 'high', label: 'Загружен' };
  if (pct >= 50) return { level: 'mid', label: 'В графике' };
  return { level: 'low', label: 'Есть время' };
}

interface OverviewPageProps {
  onNewBooking: () => void;
  onEditBooking: (b: Booking) => void;
}

export function OverviewPage({ onNewBooking, onEditBooking }: OverviewPageProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { isEnabled } = useModuleConfig();
  const dashboardView = getDashboardView(profile?.role);
  const canBook = canManageBookings(profile?.role);
  const canDelete = isAdmin(profile?.role);
  const { refresh } = useDataRefresh();
  const { stats, loading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { metrics, loading: metricsLoading } = useExecutiveMetrics();
  const [showCharts, toggleCharts] = useAnalyticsVisibility('overview');
  const [comparisonKind, setComparisonKind] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('month');

  const { data: bookings, update, remove } = useLocalQuery<Booking>(
    'bookings',
    BOOKING_SELECT,
    { orderBy: 'scheduled_at', ascending: true }
  );
  const { data: staff } = useLocalQuery<Staff>('staff', '*', { orderBy: 'workload_pct', ascending: false });
  const { data: invoices } = useLocalQuery<Invoice>('invoices', '*, customers(*)', { orderBy: 'created_at' });
  const { data: customers } = useLocalQuery<Customer>('customers', 'id, full_name, visit_count, created_at', { orderBy: 'created_at' });

  const myStaffId = useMemo(() => {
    if (profile?.role !== 'detailer') return null;
    return staff.find((s) => s.profile_id === profile.id)?.id ?? null;
  }, [profile, staff]);

  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().slice(0, 10);

  const visibleBookings = useMemo(() => {
    if (dashboardView === 'detailer' && myStaffId) {
      return bookings.filter((b) => b.assigned_technician_id === myStaffId);
    }
    return bookings;
  }, [bookings, dashboardView, myStaffId]);

  const todayBookings = visibleBookings.filter((b) => b.scheduled_at?.startsWith(todayStr));
  const todayDone = todayBookings.filter((b) => overviewStatusClass(b.status) === 'done').length;
  const unpaidInvoices = invoices.filter((i) => i.status !== 'paid');
  const availableStaff = staff.filter((s) => s.workload_pct < 80).length;

  const dashboardAlerts = useMemo((): DashboardAlert[] => {
    const alerts: DashboardAlert[] = [];
    if (!metrics) return alerts;

    if (metrics.delayedJobs > 0) {
      alerts.push({
        id: 'delayed',
        type: 'overdue_job',
        title: 'Просроченные работы',
        body: `${metrics.delayedJobs} заказ(ов) с истёкшим ETA`,
        severity: 'critical',
      });
    }
    if (metrics.lowStockCount > 0) {
      alerts.push({
        id: 'stock',
        type: 'low_stock',
        title: 'Низкий остаток на складе',
        body: `${metrics.lowStockCount} позиций ниже минимума`,
        severity: 'warn',
      });
    }
    if (metrics.overdueInvoices > 0) {
      alerts.push({
        id: 'invoices',
        type: 'overdue_invoice',
        title: 'Просроченные счета',
        body: `${metrics.overdueInvoices} счет(ов) просрочено`,
        severity: 'critical',
      });
    }
    if (metrics.pendingApprovals > 0) {
      alerts.push({
        id: 'approvals',
        type: 'pending_approval',
        title: 'Ожидают одобрения',
        body: `${metrics.pendingApprovals} работ на контроле качества`,
        severity: 'warn',
      });
    }
    return alerts;
  }, [metrics]);

  const cycleStatus = async (b: Booking) => {
    const next = nextJobStatus(b.status);
    const err = await update(b.id, { status: next } as Partial<Booking>);
    if (err) { toast('Ошибка: ' + err); return; }
    const syncErr = await syncVehicleFromBookingStatus(b.vehicle_id, next);
    if (syncErr) toast('Статус обновлён, доска цеха не синхронизирована');
    await refetchStats();
    refresh();
    toast(`Статус: ${JOB_STATUS_LABELS[next]}`);
  };

  const deleteBooking = async (id: string) => {
    const err = await remove(id);
    if (err) { toast('Ошибка: ' + err); return; }
    await refetchStats();
    refresh();
    toast('Бронь удалена');
  };

  const loading = statsLoading || metricsLoading;
  if (loading) {
    return (
      <div className="app-dashboard">
        <div className="dash-hero dash-hero--loading">
          <div className="dash-hero-shimmer" />
        </div>
        <div className="empty-state">Загрузка данных...</div>
      </div>
    );
  }

  const role = profile?.role;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'команда';
  const heroTitle =
    dashboardView === 'detailer' ? 'Мои задачи' :
    dashboardView === 'finance' ? 'Финансовый обзор' :
    dashboardView === 'operations' ? 'Операционный центр' :
    `Привет, ${firstName}`;

  const heroSub =
    dashboardView === 'detailer'
      ? 'Назначенные работы и задачи на сегодня.'
      : 'Сводка по KPI, цеху, финансам и клиентам в одном месте.';

  const quickActions: { view?: ViewId; label: string; hint: string; action?: () => void }[] = [];
  if (canBook) {
    quickActions.push({ label: 'Новый заказ', hint: 'Создать бронь', action: onNewBooking });
  }
  (
    [
      { view: 'bookings' as ViewId, label: 'Брони', hint: 'Расписание' },
      { view: 'pipeline' as ViewId, label: 'Цех', hint: 'Этапы работ' },
      { view: 'finance' as ViewId, label: 'Финансы', hint: 'Счета' },
      { view: 'mailbox' as ViewId, label: 'Почта', hint: 'Клиенты' },
      { view: 'customers' as ViewId, label: 'Клиенты', hint: 'База' },
    ] as const
  ).forEach((item) => {
    if (canAccessView(role, item.view) && isEnabled(item.view)) {
      quickActions.push(item);
    }
  });

  const showExecutive = dashboardView === 'full' || dashboardView === 'finance';
  const showOperations = dashboardView === 'full' || dashboardView === 'operations' || dashboardView === 'detailer';
  const showFinance = dashboardView === 'full' || dashboardView === 'finance' || dashboardView === 'operations';
  const showCustomers = dashboardView === 'full' || dashboardView === 'operations';

  return (
    <div className="app-dashboard">
      <SetupBanner />

      {showOperations && <ShiftClock />}

      {showCharts && showOperations && (
        <QuickCounters
          counters={[
            { icon: ClipboardList, label: 'Запланировано', value: stats.planned, tone: 'info' },
            { icon: CarFront, label: 'В работе', value: stats.inProgress, tone: 'brand' },
            { icon: AlarmClock, label: 'Готово сегодня', value: stats.completedToday, tone: 'success' },
            { icon: Wallet, label: 'Ждут подтверждения', value: stats.awaitingApproval, tone: 'warning' },
          ]}
        />
      )}

      <section className="dash-hero" aria-label="Обзор">
        <div className="dash-hero-glow" aria-hidden />
        <div className="dash-hero-grid">
          <div className="dash-hero-copy">
            <div className="dash-hero-eyebrow">
              <span className="dash-hero-dot" aria-hidden />
              Смена · {today}
            </div>
            <h1 className="dash-hero-title">{heroTitle}</h1>
            <p className="dash-hero-sub">{heroSub}</p>
            <div className="seg" style={{ marginTop: 18, padding: 4 }} role="tablist" aria-label="Режим обзора">
              <div className={`seg-btn${!showCharts ? ' active' : ''}`} role="tab" aria-selected={!showCharts} style={{ padding: '11px 20px', fontSize: 14 }} onClick={() => showCharts && toggleCharts()}>
                <ClipboardList size={16} strokeWidth={1.75} />Обзор
              </div>
              <div className={`seg-btn${showCharts ? ' active' : ''}`} role="tab" aria-selected={showCharts} style={{ padding: '11px 20px', fontSize: 14 }} onClick={() => !showCharts && toggleCharts()}>
                <TrendingUp size={16} strokeWidth={1.75} />Аналитика
              </div>
            </div>
          </div>
          <div className="dash-hero-side">
            {showCharts && metrics && showOperations && (
              <div className="dash-hero-gauge-row">
              <RingGauge
                progress={todayBookings.length ? todayDone / todayBookings.length : 0}
                value={`${todayDone}/${todayBookings.length}`}
                caption="выполнено"
              />
              <div className="dash-hero-metrics">
                <div className="dash-hero-metric">
                  <span className="dash-hero-metric-value">{todayBookings.length}</span>
                  <span className="dash-hero-metric-label">сегодня</span>
                </div>
                <div className="dash-hero-metric">
                  <span className="dash-hero-metric-value">{metrics.activeJobs}</span>
                  <span className="dash-hero-metric-label">активных</span>
                </div>
                <div className="dash-hero-metric">
                  <span className="dash-hero-metric-value">{dashboardAlerts.length}</span>
                  <span className="dash-hero-metric-label">оповещений</span>
                </div>
              </div>
              </div>
            )}
          </div>
        </div>

        {quickActions.length > 0 && (
          <div className="dash-quick-row">
            {quickActions.map((item) => (
              <button
                key={item.label}
                type="button"
                className="dash-quick-card"
                onClick={() => (item.action ? item.action() : item.view && navigate(`/${item.view}`))}
              >
                <span className="dash-quick-label">{item.label}</span>
                <span className="dash-quick-hint">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="dash-body">

      {showCharts && metrics && showExecutive && (
        <>
          <div className="section-block dashboard-executive">
            <div className="section-head">
              <div><div className="section-eyebrow">Руководство</div><div className="section-title">Ключевые показатели</div></div>
            </div>
            <div className="kpi-grid">
              <KpiComparison label="Выручка (мес.)" current={metrics.revenue.current} previous={metrics.revenue.previous} changePct={metrics.revenue.changePct} spark={showCharts ? metrics.revenueSeries : undefined} icon={TrendingUp} tone="brand" />
              <KpiComparison label="Завершено работ" current={metrics.completedJobs.current} previous={metrics.completedJobs.previous} changePct={metrics.completedJobs.changePct} format="number" icon={Wrench} tone="success" />
              <KpiCard
                label="Активные / ожидают / отменено"
                value={metrics.activeJobs}
                delta={`${metrics.pendingJobs} ожидают · ${metrics.cancelledJobs} отменено`}
                icon={Clock}
                tone="info"
              />
              <KpiCard
                label="Средний чек"
                value={fmt(metrics.avgJobValue)}
                note="за текущий месяц"
                icon={Car}
                tone="warning"
              />
            </div>
            {showCharts && (
              <>
                <div style={{ height: 1, background: 'var(--line)', margin: '24px 0 20px' }} />
                <PeriodComparisonPanel comparisons={metrics.comparisons} active={comparisonKind} onSelect={setComparisonKind} />
              </>
            )}
          </div>
        </>
      )}

      {showCharts && metrics && dashboardView === 'finance' && (
        <div className="kpi-grid" style={{ marginBottom: 44 }}>
          <KpiComparison label="Выручка" current={metrics.revenue.current} previous={metrics.revenue.previous} changePct={metrics.revenue.changePct} spark={showCharts ? metrics.revenueSeries : undefined} icon={TrendingUp} tone="brand" />
          <KpiCard label="К оплате" value={fmt(stats.owedAmount)} delta={`${stats.overdueCount} просроченных`} deltaUp={false} icon={Clock} tone="warning" />
          <KpiCard label="Выручка за месяц" value={fmt(stats.paidRevenue)} icon={Wrench} tone="success" />
        </div>
      )}

      {showCharts && showOperations && (
        <div className="kpi-grid">
          <KpiCard
            label="Сегодня · запланировано"
            value={todayBookings.length}
            delta={`${todayBookings.filter((b) => b.status === 'in_progress').length} в работе`}
            note={`${todayBookings.filter((b) => ['new_enquiry','confirmed','vehicle_received'].includes(b.status)).length} ожидают`}
            icon={Calendar}
            tone="brand"
          />
          <KpiCard
            label="Активные заказы"
            value={metrics?.activeJobs ?? stats.activeBookings}
            delta={`${stats.inProgress} в работе · ${stats.awaitingApproval} на контроле`}
            note={`${stats.completedToday} завершено сегодня`}
            icon={Wrench}
            tone="info"
          />
          <KpiCard
            label="Авто в цехе"
            value={stats.carsInProd}
            delta={`${stats.awaitingInspection} ждут осмотра`}
            note={`${metrics?.delayedJobs ?? 0} просрочено по ETA`}
            deltaUp={!(metrics?.delayedJobs)}
            icon={Car}
            tone="warning"
          />
          <KpiCard
            label="Команда"
            value={availableStaff}
            delta="техников свободны"
            note={`средняя загрузка ${staff.length ? Math.round(staff.reduce((s, x) => s + x.workload_pct, 0) / staff.length) : 0}%`}
            icon={Users}
            tone="success"
          />
        </div>
      )}

      <div className="dashboard-widgets-row" style={showCharts ? undefined : { gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {showCharts && showFinance && metrics && (
          <FinanceSnapshot
            paidRevenue={stats.paidRevenue}
            owedAmount={stats.owedAmount}
            overdueCount={stats.overdueCount}
            revenueSeries={metrics.revenueSeries}
            showChart={showCharts}
          />
        )}
        {showCharts && showCustomers && metrics && (
          <CustomerSnapshot
            newCustomers={metrics.newCustomers.current}
            returningCustomers={metrics.returningCustomers}
            retentionProxy={metrics.retentionProxy}
            showRings={showCharts}
            totalCustomers={customers.length}
            recent={customers.slice(0, 4).map((c) => ({
              id: c.id,
              name: c.full_name,
              sub: (c.visit_count ?? 0) > 1 ? `Визитов: ${c.visit_count}` : 'Новый клиент',
            }))}
          />
        )}
        {(dashboardView === 'full' || dashboardView === 'operations' || dashboardView === 'finance') && metrics && (
          <DashboardAlerts alerts={dashboardView === 'finance' ? dashboardAlerts.filter((a) => a.type === 'overdue_invoice') : dashboardAlerts} onNavigate={navigate} />
        )}
      </div>

      {(dashboardView === 'full' || dashboardView === 'operations' || dashboardView === 'finance') && (
        <AftercareCard onlyInvoices={dashboardView === 'finance'} />
      )}

      {showOperations && (
        <>
          <div className="section-block">
            <div className="section-head">
              <div><div className="section-eyebrow">Бронирования</div><div className="section-title">Сегодняшний график</div></div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {canBook && <div className="tag add" onClick={onNewBooking}>+ Новый заказ</div>}
                <div className="link-btn" onClick={() => navigate('/bookings')}>Все брони →</div>
              </div>
            </div>
            {todayBookings.length ? todayBookings.map((b) => (
              <div className="uo-row" key={b.id}>
                <div className="uo-time">
                  <b>{fmtTime(b.scheduled_at)}</b>
                  <span>{b.bay || '—'}</span>
                </div>
                <VehicleThumb brand={b.vehicles?.brand} vehicleId={b.vehicle_id} size="sm" />
                <div className="uo-row-main" onClick={() => canBook && onEditBooking(b)}>
                  <div className="uo-row-title">{b.vehicles ? vehicleDisplayName(b.vehicles) : '—'}</div>
                  <div className="uo-row-sub">{b.customers?.full_name || '—'} · {b.services?.name || '—'}</div>
                </div>
                {b.staff?.full_name && (
                  <div className="uo-row-person" title="Исполнитель">
                    <Avatar name={b.staff.full_name} size={26} />
                    <span>{b.staff.full_name}</span>
                  </div>
                )}
                <div className="uo-row-trail">
                  <button type="button" className={`uo-pill uo-pill--${bookingTone(b.status)}`} onClick={() => cycleStatus(b)} title="Сменить статус">
                    {overviewStatusLabel(b.status)}
                  </button>
                  {canDelete && (
                    <button type="button" className="uo-icon-btn" aria-label="Удалить бронь" onClick={() => deleteBooking(b.id)}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )) : <div className="empty-state">Броней на сегодня нет.</div>}
          </div>

          {metrics && (
            <div className="section-block">
              <div className="section-head">
                <div><div className="section-eyebrow">Производство</div><div className="section-title">Этапы</div></div>
                <div className="link-btn" onClick={() => navigate('/pipeline')}>Открыть доску →</div>
              </div>
              <WorkflowBoard counts={metrics.workflowCounts} stageGroups={metrics.stageGroups} hideChart={!showCharts} />
            </div>
          )}

          {showCharts && (
          <div className="section-block">
            <div className="section-head">
              <div><div className="section-eyebrow">Команда</div><div className="section-title">Загрузка техников</div></div>
              <div className="link-btn" onClick={() => navigate('/staff')}>Все сотрудники →</div>
            </div>
            <div className="uo-team-grid">
              {staff.slice(0, dashboardView === 'detailer' ? 2 : 4).map((s) => {
                const assigned = bookings.filter((b) => b.assigned_technician_id === s.id && !['completed','delivered','cancelled'].includes(b.status)).length;
                const { level, label } = loadLevel(s.workload_pct);
                return (
                  <div className="uo-team-card" key={s.id}>
                    <div className="uo-team-top">
                      <Avatar name={s.full_name} size={44} />
                      <div className="uo-team-id">
                        <div className="uo-team-name">{s.full_name}</div>
                        <div className="uo-team-role">{s.role}</div>
                      </div>
                      <div className="uo-team-load">
                        <b>{s.workload_pct}%</b>
                        <span className={`uo-load-tag uo-load-tag--${level}`}>{label}</span>
                      </div>
                    </div>
                    <div className={`uo-meter uo-meter--${level}`}><span style={{ width: `${Math.min(100, s.workload_pct)}%` }} /></div>
                    <div className="uo-team-foot">{assigned} {assigned === 1 ? 'активная работа' : 'активных работ'}</div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </>
      )}

      {showFinance && (
        <div className="section-block">
          <div className="section-head">
            <div><div className="section-eyebrow">Финансы</div><div className="section-title">Счета к оплате</div></div>
            <div className="link-btn" onClick={() => navigate('/finance')}>Все счета →</div>
          </div>
          {unpaidInvoices.length ? unpaidInvoices.slice(0, 5).map((inv) => (
            <div className="uo-row" key={inv.id}>
              <Avatar name={inv.customers?.full_name} size={44} />
              <div className="uo-row-main">
                <div className="uo-row-title">{inv.customers?.full_name || '—'}</div>
                <div className="uo-row-sub">{inv.invoice_number} · {inv.description}</div>
              </div>
              <div className="uo-amount">
                <b>{fmt(Number(inv.amount))}</b>
                <span>{inv.due_date ? (inv.status === 'overdue' ? `срок был ${shortDate(inv.due_date)}` : `оплатить до ${shortDate(inv.due_date)}`) : 'без срока'}</span>
              </div>
              <div className="uo-row-trail">
                <span className={`uo-pill uo-pill--static uo-pill--${inv.status === 'overdue' ? 'danger' : 'warning'}`}>
                  {inv.status === 'overdue' ? 'Просрочен' : 'Ожидает'}
                </span>
              </div>
            </div>
          )) : <div className="empty-state">Нет счетов к оплате.</div>}
        </div>
      )}

      {dashboardView === 'detailer' && !todayBookings.length && (
        <div className="empty-state">На сегодня назначенных работ нет.</div>
      )}
      </div>
    </div>
  );
}
