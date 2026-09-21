import { useMemo, useState } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { Pencil, Trash2 } from 'lucide-react';
import { JobsDashboard } from '../components/dashboard/PageDashboards';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { useAuth } from '../contexts/AuthContext';
import { JobDetailPanel } from '../components/JobDetailPanel';
import { ListFilters, applyBookingFiltersExtended, defaultBookingFilters } from '../components/ListFilters';
import {
  BOOKING_SELECT,
  JOB_STATUS_LABELS,
  JOB_STATUS_CYCLE,
  PAYMENT_STATUS_LABELS,
  fmtTime,
  fmtDate,
  vehicleDisplayName,
} from '../lib/constants';
import { nextJobStatus, jobWorkflowStep, syncVehicleFromBookingStatus } from '../lib/workflow';
import { notifyBookingStatusChange } from '../lib/notifications';
import { canManageBookings, isAdmin } from '../lib/permissions';
import type { Booking, Customer, Service, Staff, Vehicle } from '../types/database';
import { VehicleThumb } from '../components/VehicleThumb';
import { useRevealDetail } from '../hooks/useRevealDetail';

function statusClass(status: string) {
  if (status === 'in_progress') return 'progress';
  if (status === 'completed' || status === 'delivered') return 'done';
  if (status === 'awaiting_approval') return 'planned';
  return 'planned';
}

function paymentClass(s: string) {
  if (s === 'paid') return 'done';
  if (s === 'partial') return 'planned';
  return 'progress';
}

export function JobsPage({ onEdit, hideHeader }: { onEdit: (b: Booking | null) => void; hideHeader?: boolean }) {
  const [showCharts, toggleCharts] = useAnalyticsVisibility('jobs');
  const { data: jobs, update, remove } = useLocalQuery<Booking>('bookings', BOOKING_SELECT, { orderBy: 'scheduled_at' });
  const { data: staffList } = useLocalQuery<Staff>('staff', '*');
  const { data: services } = useLocalQuery<Service>('services', '*');
  const { data: customers } = useLocalQuery<Customer>('customers', '*');
  const { data: vehicles } = useLocalQuery<Vehicle>('vehicles', '*');
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const { profile } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useRevealDetail(selectedId);
  const [filters, setFilters] = useState(defaultBookingFilters);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());

  const myStaffId = useMemo(() => {
    if (profile?.role !== 'detailer') return null;
    return staffList.find((s) => s.profile_id === profile.id)?.id ?? null;
  }, [profile, staffList]);

  const filtered = applyBookingFiltersExtended(
    myStaffId ? jobs.filter((j) => j.assigned_technician_id === myStaffId) : jobs,
    filters
  );

  const selected = filtered.find((j) => j.id === selectedId);

  const cycleStatus = async (j: Booking) => {
    const previousStatus = j.status;
    const next = nextJobStatus(j.status);
    const updates: Record<string, unknown> = { status: next };
    if (['completed', 'delivered'].includes(next)) updates.completed_at = new Date().toISOString();
    const err = await update(j.id, updates as Partial<Booking>);
    if (err) { toast('Ошибка: ' + err); return; }
    const syncErr = await syncVehicleFromBookingStatus(j.vehicle_id, next);
    if (syncErr) toast('Статус обновлён, доска цеха не синхронизирована');
    await notifyBookingStatusChange({ ...j, status: next }, previousStatus, { silent: true });
    refresh();
    toast(`Статус: ${JOB_STATUS_LABELS[next]}`);
  };

  const canBook = canManageBookings(profile?.role);
  const canDelete = isAdmin(profile?.role);

  const toggleBulk = (id: string) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSetStatus = async (status: Booking['status']) => {
    if (!bulkIds.size) return;
    for (const id of bulkIds) {
      const job = filtered.find((j) => j.id === id);
      const previousStatus = job?.status ?? status;
      await update(id, { status } as Partial<Booking>);
      if (job) await notifyBookingStatusChange({ ...job, status }, previousStatus, { silent: true });
    }
    refresh();
    toast(`Обновлено ${bulkIds.size} заказ(ов)`);
    setBulkIds(new Set());
  };

  const exportCSV = () => {
    const rows = [['Дата', 'Клиент', 'Авто', 'Услуга', 'Техник', 'Статус', 'Оплата'],
      ...filtered.map((j) => [j.scheduled_at, j.customers?.full_name, j.vehicles ? vehicleDisplayName(j.vehicles) : '', j.services?.name, j.staff?.full_name, j.status, j.payment_status])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jobs.csv';
    a.click();
    toast('Заказы экспортированы');
  };

  return (
    <>
      {!hideHeader && (
        <div className="header-row">
          <div>
            <div className="eyebrow"><span className="dot"></span>Операции · заказы</div>
            <h1 className="page-title">Управление заказами</h1>
            <p className="page-sub">
              {myStaffId ? 'Ваши назначенные заказы с чек-листом и фото.' : 'Все заказы: статус, техник, ETA, чек-лист, фото до/после.'}
            </p>
          </div>
          <div className="tag-row">
            <AnalyticsToggle visible={showCharts} onToggle={toggleCharts} />
            {canBook && <div className="tag add" onClick={() => onEdit(null)}>+ Новый заказ</div>}
            <div className="tag ghost" onClick={exportCSV}>Экспорт CSV</div>
          </div>
        </div>
      )}
      {hideHeader && (canBook || true) && (
        <div className="tag-row" style={{ marginBottom: 18 }}>
          <AnalyticsToggle visible={showCharts} onToggle={toggleCharts} />
          {canBook && <div className="tag add" onClick={() => onEdit(null)}>+ Новый заказ</div>}
          <div className="tag ghost" onClick={exportCSV}>Экспорт CSV</div>
        </div>
      )}

      {showCharts && <JobsDashboard jobs={filtered} />}

      <ListFilters
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        services={services}
        staffList={staffList}
        customers={customers}
        vehicles={vehicles}
      />

      {canBook && bulkIds.size > 0 && (
        <div className="filter-row" style={{ padding: 0, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Выбрано: {bulkIds.size}</span>
          <div className="tag ghost" onClick={() => bulkSetStatus('in_progress')}>В работу</div>
          <div className="tag ghost" onClick={() => bulkSetStatus('quality_check')}>Контроль</div>
          <div className="tag ghost" onClick={() => bulkSetStatus('completed')}>Завершить</div>
          <div className="tag ghost" onClick={() => setBulkIds(new Set())}>Сброс</div>
        </div>
      )}

      <div className="table-wrap jobs-table-wrap">
        <div className="table-main jobs-table-scroll">
          {filtered.map((j) => (
            <div
              className={`booking-row${selectedId === j.id ? ' row-selected' : ''}`}
              key={j.id}
              style={{ gridTemplateColumns: '28px 70px 1.4fr 1fr 1fr auto auto auto 56px', cursor: 'pointer' }}
              onClick={() => setSelectedId(j.id)}
            >
              {canBook && (
                <input type="checkbox" checked={bulkIds.has(j.id)} onChange={() => toggleBulk(j.id)} onClick={(e) => e.stopPropagation()} />
              )}
              <div className="booking-time">{fmtTime(j.scheduled_at)}<br /><span style={{ fontSize: 10, color: 'var(--muted-2)' }}>{fmtDate(j.scheduled_at)}</span></div>
              <div className="with-thumb">
                <VehicleThumb brand={j.vehicles?.brand} vehicleId={j.vehicle_id} />
                <div className="with-thumb-text">
                  <div className="booking-car">{j.vehicles ? vehicleDisplayName(j.vehicles) : '—'}</div>
                  <div className="booking-client">{j.customers?.full_name} · #{j.id.slice(0, 8)}</div>
                </div>
              </div>
              <div className="booking-service">{j.services?.name || '—'}</div>
              <div className="booking-staff">{j.staff?.full_name || '—'}<br /><span style={{ fontSize: 10, color: 'var(--muted-2)' }}>ETA {fmtDate(j.eta_at || j.vehicles?.eta_at)}</span></div>
              <div className="workflow-bar">
                {JOB_STATUS_CYCLE.filter((s) => s !== 'cancelled').map((s, i) => (
                  <span key={s} className={`workflow-step ${i <= jobWorkflowStep(j.status) ? 'done' : ''}`} />
                ))}
              </div>
              <div className={`status-badge ${statusClass(j.status)}`} onClick={(e) => { e.stopPropagation(); cycleStatus(j); }}>{JOB_STATUS_LABELS[j.status] || j.status}</div>
              <div className={`status-badge ${paymentClass(j.payment_status)}`} style={{ cursor: 'default' }}>{PAYMENT_STATUS_LABELS[j.payment_status] ?? j.payment_status}</div>
              <div className="icon-actions">
                {canBook && <span className="icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(j); }}><Pencil size={13} strokeWidth={1.75} /></span>}
                {canDelete && <span className="icon-btn danger" onClick={async (e) => {
                  e.stopPropagation();
                  const err = await remove(j.id);
                  if (err) toast('Ошибка: ' + err);
                  else { refresh(); toast('Удалён'); }
                }}><Trash2 size={13} strokeWidth={1.75} /></span>}
              </div>
            </div>
          ))}
          {!filtered.length && <div className="empty-state">Заказов нет.</div>}
        </div>
        {selected && <JobDetailPanel job={selected} onClose={() => setSelectedId(null)} onEdit={onEdit} />}
      </div>
    </>
  );
}
