import { useState } from 'react';
import { ClipboardList, CalendarClock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { canManageBookings } from '../lib/permissions';
import { JobsPage } from './JobsPage';
import { BookingsPage } from './BookingsPage';
import type { Booking } from '../types/database';

type OpsTab = 'list' | 'calendar';

/**
 * Unified "Заказы и бронирования" module. Jobs and Bookings both read/write
 * the same underlying `bookings` table — one is a worklist view, the other a
 * calendar/capacity view of the exact same records. Rather than two separate
 * nav destinations that look and feel like duplicates, this shell gives them
 * one header, one Apple-style segmented switcher, and instant tab switching
 * (both panes stay mounted, so toggling is a plain CSS swap — no refetch,
 * no flash, filters/scroll position are preserved per tab).
 */
export function OperationsPage({
  onEdit,
  initialTab = 'list',
}: {
  onEdit: (b: Booking | null) => void;
  initialTab?: OpsTab;
}) {
  const { profile } = useAuth();
  const canSeeCalendar = canManageBookings(profile?.role);
  const [tab, setTab] = useState<OpsTab>(canSeeCalendar ? initialTab : 'list');

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Операции</div>
          <h1 className="page-title">Заказы и бронирования</h1>
          <p className="page-sub">
            Единый рабочий стол цеха: список заказов с чек-листами и календарь боксов — одни и те же записи, два взгляда.
          </p>
        </div>
        {canSeeCalendar && (
          <div className="seg ops-tab-seg" role="tablist" aria-label="Режим отображения">
            <div
              className={`seg-btn${tab === 'list' ? ' active' : ''}`}
              role="tab"
              aria-selected={tab === 'list'}
              onClick={() => setTab('list')}
            >
              <ClipboardList size={14} strokeWidth={1.75} />
              Список
            </div>
            <div
              className={`seg-btn${tab === 'calendar' ? ' active' : ''}`}
              role="tab"
              aria-selected={tab === 'calendar'}
              onClick={() => setTab('calendar')}
            >
              <CalendarClock size={14} strokeWidth={1.75} />
              Календарь
            </div>
          </div>
        )}
      </div>

      <div style={{ display: tab === 'list' ? 'block' : 'none' }}>
        <JobsPage onEdit={onEdit} hideHeader />
      </div>
      {canSeeCalendar && (
        <div style={{ display: tab === 'calendar' ? 'block' : 'none' }}>
          <BookingsPage onEdit={onEdit} hideHeader />
        </div>
      )}
    </>
  );
}
