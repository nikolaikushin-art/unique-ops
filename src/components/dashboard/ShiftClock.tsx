import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Смена — one tap starts the day, one tap ends it. Ported from the staff
 * app: a technician or receptionist glances here to know if they're
 * clocked in, without opening a separate timesheet screen.
 *
 * Persistence is local (per browser, per staff id) for now — good enough
 * to demo and to use solo, but it won't sync a shift started on one
 * device to another. Wiring it to a `shifts` table is a small, clean
 * follow-up once this is confirmed as something staff actually want.
 */
function storageKey(staffId: string) {
  return `uo-shift-${staffId}`;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function ShiftClock() {
  const { profile } = useAuth();
  const staffId = profile?.id ?? 'anon';
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey(staffId));
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });
  const [, forceTick] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt == null) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  const isOnShift = startedAt != null;
  const elapsedSeconds = isOnShift ? (Date.now() - startedAt) / 1000 : 0;

  const start = () => {
    const now = Date.now();
    setStartedAt(now);
    try {
      localStorage.setItem(storageKey(staffId), String(now));
    } catch {
      /* ignore */
    }
  };

  const end = () => {
    setStartedAt(null);
    try {
      localStorage.removeItem(storageKey(staffId));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="shift-card">
      <div className="shift-card-info">
        <span className="shift-card-label">{isOnShift ? 'Смена идёт' : 'Смена не начата'}</span>
        <span className="shift-card-clock">{formatClock(elapsedSeconds)}</span>
      </div>
      <button
        type="button"
        className={`shift-card-btn${isOnShift ? ' is-active' : ''}`}
        onClick={isOnShift ? end : start}
      >
        {isOnShift ? <Square size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        {isOnShift ? 'Завершить' : 'Начать смену'}
      </button>
    </div>
  );
}
