import { useMemo, useState } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { Pencil, Trash2 } from 'lucide-react';
import { BookingsDashboard } from '../components/dashboard/PageDashboards';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { syncVehicleFromBookingStatus } from '../lib/workflow';
import { notifyBookingStatusChange } from '../lib/notifications';
import { canManageBookings, isAdmin } from '../lib/permissions';
import { useAuth } from '../contexts/AuthContext';
import {
  BOOKING_SELECT,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_CYCLE,
  BOOKING_PRIORITY_LABELS,
  CAL_BAYS,
  CAL_START,
  CAL_END,
  fmtTime,
  fmtDate,
  PAYMENT_STATUS_LABELS,
  vehicleDisplayName,
} from '../lib/constants';
import {
  type BookingViewMode,
  applyBookingFiltersExtended,
  computeBookingAnalytics,
  bookingDurationMinutes,
  sameDay,
  getWeekDays,
  getMonthGrid,
  addDays,
  startOfDay,
  dailyCapacityMinutes,
  dailyUsedMinutes,
  capacityPct,
  priorityClass,
} from '../lib/bookings';
import { ListFilters, defaultBookingFilters } from '../components/ListFilters';
import type { Booking, Customer, Service, Staff, Vehicle } from '../types/database';
import { VehicleThumb } from '../components/VehicleThumb';

const STATUS_CYCLE = BOOKING_STATUS_CYCLE.filter((s) => s !== 'cancelled');

const VIEW_MODES: { id: BookingViewMode; label: string }[] = [
  { id: 'daily', label: 'День' },
  { id: 'weekly', label: 'Неделя' },
  { id: 'monthly', label: 'Месяц' },
  { id: 'timeline', label: 'Список' },
  { id: 'staff', label: 'Техники' },
  { id: 'capacity', label: 'Загрузка' },
];

function statusClass(status: string) {
  if (status === 'in_progress') return 'progress';
  if (status === 'completed' || status === 'delivered') return 'done';
  if (status === 'cancelled') return 'planned';
  if (status === 'quality_check' || status === 'awaiting_approval') return 'planned';
  return 'planned';
}

function paymentBadgeClass(s: string) {
  if (s === 'paid') return 'done';
  if (s === 'partial') return 'planned';
  return 'progress';
}

function DayNav({ date, onChange, mode = 'day' }: { date: Date; onChange: (d: Date) => void; mode?: 'day' | 'week' }) {
  const step = mode === 'week' ? 7 : 1;
  let label = fmtDate(date.toISOString());
  if (mode === 'week') {
    const days = getWeekDays(date);
    const a = days[0]; const b = days[6];
    label = `${a.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return (
    <div className="cal-nav">
      <button type="button" className="cal-nav-btn" onClick={() => onChange(addDays(date, -step))} aria-label="Назад">‹</button>
      <span className="cal-nav-label">{label}</span>
      <button type="button" className="cal-nav-btn" onClick={() => onChange(addDays(date, step))} aria-label="Вперёд">›</button>
      <button type="button" className="cal-nav-today" onClick={() => onChange(startOfDay(new Date()))}>Сегодня</button>
    </div>
  );
}

export function BookingsPage({ onEdit, hideHeader }: { onEdit: (b: Booking | null) => void; hideHeader?: boolean }) {
  const { data: bookings, update, remove } = useLocalQuery<Booking>('bookings', BOOKING_SELECT);
  const { data: staffList } = useLocalQuery<Staff>('staff', '*');
  const { data: services } = useLocalQuery<Service>('services', '*');
  const { data: customers } = useLocalQuery<Customer>('customers', '*');
  const { data: vehicles } = useLocalQuery<Vehicle>('vehicles', '*');
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const { profile } = useAuth();
  const canBook = canManageBookings(profile?.role);
  const canDelete = isAdmin(profile?.role);

  const [viewMode, setViewMode] = useState<BookingViewMode>('daily');
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [filters, setFilters] = useState(defaultBookingFilters);
  const [showAnalytics, toggleAnalytics] = useAnalyticsVisibility('bookings');
  const [reassignId, setReassignId] = useState<string | null>(null);

  const filtered = useMemo(
    () => applyBookingFiltersExtended(bookings, filters),
    [bookings, filters]
  );

  const dayBookings = useMemo(
    () => filtered.filter((b) => sameDay(b.scheduled_at, anchorDate)),
    [filtered, anchorDate]
  );

  const analytics = useMemo(() => computeBookingAnalytics(filtered), [filtered]);

  const cycleStatus = async (b: Booking) => {
    const previousStatus = b.status;
    const idx = STATUS_CYCLE.indexOf(b.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    const err = await update(b.id, { status: next } as Partial<Booking>);
    if (err) { toast('Ошибка: ' + err); return; }
    const syncErr = await syncVehicleFromBookingStatus(b.vehicle_id, next);
    if (syncErr) toast('Статус обновлён, доска цеха не синхронизирована');
    const notifyResult = await notifyBookingStatusChange({ ...b, status: next as Booking['status'] }, previousStatus, { silent: true });
    if (!notifyResult.ok) toast('Статус обновлён (email не отправлен)');
    refresh();
    toast('Статус обновлён');
  };

  const deleteBooking = async (id: string) => {
    const err = await remove(id);
    if (err) toast('Ошибка: ' + err);
    else toast('Бронь удалена');
  };

  const reassignTechnician = async (bookingId: string, techId: string) => {
    const err = await update(bookingId, { assigned_technician_id: techId || null } as Partial<Booking>);
    if (err) toast('Ошибка: ' + err);
    else {
      toast('Техник назначен');
      refresh();
    }
    setReassignId(null);
  };

  const renderDailyView = () => {
    const hours = CAL_END - CAL_START;
    const totalMin = hours * 60;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowPct = sameDay(now.toISOString(), anchorDate)
      ? Math.min(100, Math.max(0, ((nowMin - CAL_START * 60) / totalMin) * 100))
      : -1;

    return (
      <div className="cal-wrap">
        <DayNav date={anchorDate} onChange={setAnchorDate} />
        <div className="cal-head" style={{ gridTemplateColumns: `120px repeat(${hours}, 1fr)` }}>
          <div>Бокс</div>
          {Array.from({ length: hours }, (_, i) => (
            <div key={i}>{String(CAL_START + i).padStart(2, '0')}:00</div>
          ))}
        </div>
        {CAL_BAYS.map((bay) => {
          const inBay = dayBookings.filter((b) => b.bay === bay);
          return (
            <div className="cal-row" key={bay} style={{ gridTemplateColumns: '120px 1fr' }}>
              <div className="cal-bay">{bay}</div>
              <div className="cal-track" style={{ backgroundSize: `calc(100%/${hours}) 100%` }}>
                {nowPct >= 0 && <div className="cal-now" style={{ left: `${nowPct}%` }} />}
                {inBay.map((b) => {
                  const dur = bookingDurationMinutes(b);
                  const d = new Date(b.scheduled_at);
                  const startMin = d.getHours() * 60 + d.getMinutes() - CAL_START * 60;
                  const leftPct = Math.min(100, Math.max(0, (startMin / totalMin) * 100));
                  const widthPct = Math.max(4, Math.min((dur / totalMin) * 100, 100 - leftPct));
                  return (
                    <div
                      key={b.id}
                      className={`cal-block ${statusClass(b.status)} ${priorityClass(b.priority ?? 'normal')}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      onClick={() => onEdit(b)}
                      title={`${b.customers?.full_name ?? ''} · ${BOOKING_STATUS_LABELS[b.status]}`}
                    >
                      <div className="cbtime">
                        {fmtTime(b.scheduled_at)} · {dur} мин · {BOOKING_PRIORITY_LABELS[b.priority ?? 'normal']}
                      </div>
                      <div className="cbcar">{b.vehicles ? vehicleDisplayName(b.vehicles) : '—'}</div>
                      <div className="cbmeta">{b.services?.name ?? '—'} · {b.staff?.full_name ?? '—'}</div>
                      <div className="cbmeta">{PAYMENT_STATUS_LABELS[b.payment_status]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="cal-legend">
          <span><i style={{ borderColor: 'var(--line-strong)' }} />Запланировано</span>
          <span className="cal-legend-progress"><i />В работе</span>
          <span><i style={{ borderColor: 'rgba(31,143,95,0.45)', background: 'rgba(31,143,95,0.07)' }} />Завершено</span>
        </div>
      </div>
    );
  };

  const renderWeeklyView = () => {
    const days = getWeekDays(anchorDate);
    const hours = CAL_END - CAL_START;

    return (
      <div className="cal-wrap cal-weekly">
        <DayNav date={anchorDate} onChange={setAnchorDate} mode="week" />
        <div className="cal-week-grid">
          <div className="cal-week-corner" />
          {days.map((d) => (
            <div key={d.toISOString()} className={`cal-week-dayhead ${sameDay(new Date().toISOString(), d) ? 'today' : ''}`}>
              {d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          ))}
          {Array.from({ length: hours }, (_, hi) => {
            const hour = CAL_START + hi;
            return (
              <div key={hour} className="cal-week-row">
                <div className="cal-week-hour">{String(hour).padStart(2, '0')}:00</div>
                {days.map((d) => {
                  const slot = filtered.filter((b) => sameDay(b.scheduled_at, d) && new Date(b.scheduled_at).getHours() === hour);
                  return (
                    <div key={d.toISOString()} className="cal-week-cell">
                      {slot.map((b) => (
                        <div key={b.id} className={`cal-week-event ${statusClass(b.status)}`} onClick={() => onEdit(b)}>
                          <span className="cal-week-event-time">{fmtTime(b.scheduled_at)}</span>
                          <span>{b.vehicles ? vehicleDisplayName(b.vehicles) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMonthlyView = () => {
    const grid = getMonthGrid(anchorDate);
    const month = anchorDate.getMonth();

    return (
      <div className="cal-wrap cal-monthly">
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1))}>‹</button>
          <span className="cal-nav-label">{anchorDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
          <button type="button" className="cal-nav-btn" onClick={() => setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="cal-month-grid">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => (
            <div key={w} className="cal-month-dow">{w}</div>
          ))}
          {grid.map((d) => {
            const count = filtered.filter((b) => sameDay(b.scheduled_at, d)).length;
            const inMonth = d.getMonth() === month;
            const isToday = sameDay(new Date().toISOString(), d);
            return (
              <div
                key={d.toISOString()}
                className={`cal-month-cell ${inMonth ? '' : 'other'} ${isToday ? 'today' : ''}`}
                onClick={() => { setAnchorDate(d); setViewMode('daily'); }}
              >
                <span className="cal-month-num">{d.getDate()}</span>
                {count > 0 && <span className="cal-month-count">{count} брон.</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTimelineView = () => (
    <div className="booking-timeline booking-timeline-scroll">
      {filtered.length ? filtered.map((b) => (
        <div className="booking-row booking-row-ext" key={b.id}>
          <div className="booking-time">
            <div>{fmtDate(b.scheduled_at)}</div>
            <div>{fmtTime(b.scheduled_at)}</div>
            <div className="booking-dur">{bookingDurationMinutes(b)} мин</div>
          </div>
          <div className="with-thumb">
            <VehicleThumb brand={b.vehicles?.brand} vehicleId={b.vehicle_id} />
            <div className="with-thumb-text">
              <div className="booking-car">{b.vehicles ? vehicleDisplayName(b.vehicles) : '—'}</div>
              <div className="booking-client">{b.customers?.full_name} · {b.bay}</div>
              {b.vehicles?.registration_number && <div className="booking-client">{b.vehicles.registration_number}</div>}
            </div>
          </div>
          <div className="booking-service">{b.services?.name || '—'}</div>
          <div className="booking-staff">{b.staff?.full_name || '—'}</div>
          <div className={`priority-tag ${priorityClass(b.priority ?? 'normal')}`}>{BOOKING_PRIORITY_LABELS[b.priority ?? 'normal']}</div>
          <div className={`status-badge ${statusClass(b.status)}`} onClick={() => cycleStatus(b)}>{BOOKING_STATUS_LABELS[b.status]}</div>
          <div className={`status-badge ${paymentBadgeClass(b.payment_status)}`}>{PAYMENT_STATUS_LABELS[b.payment_status]}</div>
          <div className="icon-actions">
            {canBook && <span className="icon-btn" onClick={() => onEdit(b)}><Pencil size={13} strokeWidth={1.75} /></span>}
            {canDelete && <span className="icon-btn danger" onClick={() => deleteBooking(b.id)}><Trash2 size={13} strokeWidth={1.75} /></span>}
          </div>
        </div>
      )) : <div className="empty-state">Броней не найдено.</div>}
    </div>
  );

  const renderStaffView = () => {
    const techs = staffList.filter((s) => s.is_active);
    const hours = CAL_END - CAL_START;
    const totalMin = hours * 60;

    return (
      <div className="cal-wrap">
        <DayNav date={anchorDate} onChange={setAnchorDate} />
        <div className="cal-head" style={{ gridTemplateColumns: `140px repeat(${hours}, 1fr)` }}>
          <div>Техник</div>
          {Array.from({ length: hours }, (_, i) => (
            <div key={i}>{String(CAL_START + i).padStart(2, '0')}:00</div>
          ))}
        </div>
        {techs.map((tech) => {
          const assigned = dayBookings.filter((b) => b.assigned_technician_id === tech.id);
          return (
            <div className="cal-row" key={tech.id} style={{ gridTemplateColumns: '140px 1fr' }}>
              <div className="cal-bay">{tech.full_name}</div>
              <div className="cal-track" style={{ backgroundSize: `calc(100%/${hours}) 100%` }}>
                {assigned.map((b) => {
                  const dur = bookingDurationMinutes(b);
                  const d = new Date(b.scheduled_at);
                  const startMin = d.getHours() * 60 + d.getMinutes() - CAL_START * 60;
                  const leftPct = Math.min(100, Math.max(0, (startMin / totalMin) * 100));
                  const widthPct = Math.max(4, Math.min((dur / totalMin) * 100, 100 - leftPct));
                  return (
                    <div
                      key={b.id}
                      className={`cal-block ${statusClass(b.status)}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      onClick={() => canBook && setReassignId(reassignId === b.id ? null : b.id)}
                    >
                      <div className="cbcar">{b.vehicles ? vehicleDisplayName(b.vehicles) : '—'}</div>
                      <div className="cbmeta">{b.services?.name}</div>
                      {reassignId === b.id && canBook && (
                        <select
                          className="field-select reassign-select"
                          value={b.assigned_technician_id ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => reassignTechnician(b.id, e.target.value)}
                        >
                          <option value="">— снять —</option>
                          {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!techs.length && <div className="empty-state">Нет активных техников.</div>}
      </div>
    );
  };

  const renderCapacityView = () => {
    const days = getWeekDays(anchorDate);
    const maxMin = dailyCapacityMinutes();

    return (
      <div className="cal-wrap cal-capacity">
        <DayNav date={anchorDate} onChange={setAnchorDate} mode="week" />
        <div className="capacity-grid">
          {days.map((d) => {
            const used = dailyUsedMinutes(filtered, d);
            const pct = capacityPct(used, maxMin);
            const count = filtered.filter((b) => sameDay(b.scheduled_at, d) && b.status !== 'cancelled').length;
            return (
              <div key={d.toISOString()} className={`capacity-day ${sameDay(new Date().toISOString(), d) ? 'today' : ''}`}>
                <div className="capacity-day-label">{d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</div>
                <div className="capacity-bar-wrap">
                  <div className={`capacity-bar ${pct >= 90 ? 'full' : pct >= 70 ? 'high' : ''}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="capacity-stats">{pct}% · {count}/{CAL_BAYS.length} боксов · {Math.round(used / 60)}ч</div>
                <div className="capacity-bays">
                  {CAL_BAYS.map((bay) => {
                    const bayCount = filtered.filter((b) => sameDay(b.scheduled_at, d) && b.bay === bay && b.status !== 'cancelled').length;
                    return (
                      <span key={bay} className={bayCount > 1 ? 'over' : ''}>{bay}: {bayCount}</span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="cal-legend">
          <span>Макс. ёмкость: {CAL_BAYS.length} боксов × {CAL_END - CAL_START}ч = {Math.round(maxMin / 60)} ч-мин/день</span>
        </div>
      </div>
    );
  };

  const renderView = () => {
    const empty = viewMode !== 'timeline' && viewMode !== 'monthly' && viewMode !== 'capacity' && !dayBookings.length && !filtered.length;
    if (empty && viewMode === 'daily') return <div className="empty-state">Броней на этот день нет.</div>;

    switch (viewMode) {
      case 'daily': return renderDailyView();
      case 'weekly': return renderWeeklyView();
      case 'monthly': return renderMonthlyView();
      case 'timeline': return renderTimelineView();
      case 'staff': return renderStaffView();
      case 'capacity': return renderCapacityView();
      default: return null;
    }
  };

  return (
    <>
      {!hideHeader && (
        <div className="header-row">
          <div>
            <div className="eyebrow"><span className="dot"></span>Планирование</div>
            <h1 className="page-title">Бронирования</h1>
            <p className="page-sub">Календарь боксов, техников и загрузки цеха — все записи с фильтрами и аналитикой.</p>
          </div>
          <div className="tag-row">
            <AnalyticsToggle visible={showAnalytics} onToggle={toggleAnalytics} />
            {canBook && <div className="tag add" onClick={() => onEdit(null)}>+ Новая бронь</div>}
          </div>
        </div>
      )}
      {hideHeader && (
        <div className="tag-row" style={{ marginBottom: 18 }}>
          <AnalyticsToggle visible={showAnalytics} onToggle={toggleAnalytics} />
          {canBook && <div className="tag add" onClick={() => onEdit(null)}>+ Новая бронь</div>}
        </div>
      )}

      {showAnalytics && <BookingsDashboard bookings={filtered} analytics={analytics} />}

      <ListFilters
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        services={services}
        staffList={staffList}
        customers={customers}
        vehicles={vehicles}
      />

      <div className="booking-toolbar booking-toolbar-stacked">
        <div className="seg seg-scroll workflow-status-seg">
          {BOOKING_STATUS_CYCLE.map((s) => (
            <div
              key={s}
              className={`seg-btn ${filters.status === s ? 'active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, status: f.status === s ? 'all' : s }))}
            >
              {BOOKING_STATUS_LABELS[s] ?? s}
            </div>
          ))}
        </div>
        <div className="seg seg-scroll">
          {VIEW_MODES.map((m) => (
            <div
              key={m.id}
              className={`seg-btn ${viewMode === m.id ? 'active' : ''}`}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>

      {renderView()}
    </>
  );
}
