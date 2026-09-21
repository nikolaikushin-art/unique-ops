import { bookingValue } from './metrics';
import { CAL_BAYS, CAL_END, CAL_START } from './constants';
import type { Booking, BookingStatus } from '../types/database';

export type BookingViewMode = 'daily' | 'weekly' | 'monthly' | 'timeline' | 'staff' | 'capacity';

export interface BookingFilterState {
  status: string;
  dateFrom: string;
  dateTo: string;
  serviceId: string;
  staffId: string;
  customerId: string;
  vehicleId: string;
  plate: string;
  paymentStatus: string;
  search: string;
}

export function bookingDurationMinutes(b: Booking): number {
  return b.services?.duration_minutes ?? 60;
}

export function bookingEndTime(b: Booking): Date {
  const start = new Date(b.scheduled_at);
  return new Date(start.getTime() + bookingDurationMinutes(b) * 60_000);
}

export function bookingsOverlap(a: Booking, b: Booking): boolean {
  if (a.id === b.id) return false;
  if (a.status === 'cancelled' || b.status === 'cancelled') return false;
  const aStart = new Date(a.scheduled_at).getTime();
  const aEnd = bookingEndTime(a).getTime();
  const bStart = new Date(b.scheduled_at).getTime();
  const bEnd = bookingEndTime(b).getTime();
  return aStart < bEnd && bStart < aEnd;
}

export interface BookingDraft {
  id?: string;
  scheduled_at: string;
  bay: string;
  assigned_technician_id: string | null;
  service_id?: string | null;
  duration_minutes?: number;
}

export function detectBookingConflicts(
  draft: BookingDraft,
  all: Booking[],
  services?: { id: string; duration_minutes: number }[]
): { bayConflicts: Booking[]; techConflicts: Booking[] } {
  const dur =
    draft.duration_minutes ??
    services?.find((s) => s.id === draft.service_id)?.duration_minutes ??
    60;
  const pseudo = {
    id: draft.id ?? '__draft__',
    scheduled_at: draft.scheduled_at,
    bay: draft.bay,
    assigned_technician_id: draft.assigned_technician_id,
    status: 'confirmed' as BookingStatus,
    services: { duration_minutes: dur },
  } as Booking;

  const active = all.filter((b) => b.status !== 'cancelled' && b.id !== draft.id);
  const bayConflicts = active.filter((b) => b.bay === draft.bay && bookingsOverlap(pseudo, b));
  const techConflicts = draft.assigned_technician_id
    ? active.filter(
        (b) => b.assigned_technician_id === draft.assigned_technician_id && bookingsOverlap(pseudo, b)
      )
    : [];
  return { bayConflicts, techConflicts };
}

export function sameDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function formatDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getWeekDays(anchor: Date): Date[] {
  const d = startOfDay(anchor);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(d, mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function getMonthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfDay(first);
  const dow = start.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const gridStart = addDays(start, offset);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** Total bay-minutes available per day */
export function dailyCapacityMinutes(): number {
  return (CAL_END - CAL_START) * 60 * CAL_BAYS.length;
}

export function dailyUsedMinutes(bookings: Booking[], day: Date): number {
  return bookings
    .filter((b) => b.status !== 'cancelled' && sameDay(b.scheduled_at, day))
    .reduce((sum, b) => sum + bookingDurationMinutes(b), 0);
}

export function capacityPct(used: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

export function applyBookingFiltersExtended(
  bookings: Booking[],
  f: BookingFilterState
): Booking[] {
  const q = f.search.trim().toLowerCase();
  return bookings.filter((b) => {
    if (f.status !== 'all' && b.status !== f.status) return false;
    if (f.serviceId && b.service_id !== f.serviceId) return false;
    if (f.staffId && b.assigned_technician_id !== f.staffId) return false;
    if (f.customerId && b.customer_id !== f.customerId) return false;
    if (f.vehicleId && b.vehicle_id !== f.vehicleId) return false;
    if (f.paymentStatus && b.payment_status !== f.paymentStatus) return false;
    if (f.plate) {
      const plate = (b.vehicles?.registration_number ?? '').toLowerCase();
      if (!plate.includes(f.plate.toLowerCase())) return false;
    }
    const d = b.scheduled_at?.slice(0, 10);
    if (f.dateFrom && d && d < f.dateFrom) return false;
    if (f.dateTo && d && d > f.dateTo) return false;
    if (q) {
      const hay = [
        b.customers?.full_name,
        b.vehicles?.brand,
        b.vehicles?.model,
        b.vehicles?.registration_number,
        b.services?.name,
        b.staff?.full_name,
        b.bay,
        b.notes,
        b.internal_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface BookingAnalytics {
  total: number;
  completed: number;
  cancelled: number;
  avgTurnaroundHours: number | null;
  technicianUtilisation: { name: string; pct: number; minutes: number }[];
  popularServices: { name: string; count: number }[];
  peakHours: { hour: number; count: number }[];
  revenue: number;
}

export function computeBookingAnalytics(bookings: Booking[]): BookingAnalytics {
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const completed = bookings.filter((b) => ['completed', 'delivered'].includes(b.status));
  const cancelled = bookings.filter((b) => b.status === 'cancelled');

  const turnarounds = completed
    .filter((b) => b.completed_at)
    .map((b) => (new Date(b.completed_at!).getTime() - new Date(b.scheduled_at).getTime()) / 3_600_000);
  const avgTurnaroundHours =
    turnarounds.length > 0 ? Math.round((turnarounds.reduce((a, x) => a + x, 0) / turnarounds.length) * 10) / 10 : null;

  const techMinutes: Record<string, { name: string; minutes: number }> = {};
  for (const b of active) {
    if (!b.assigned_technician_id) continue;
    const id = b.assigned_technician_id;
    if (!techMinutes[id]) techMinutes[id] = { name: b.staff?.full_name ?? '—', minutes: 0 };
    techMinutes[id].minutes += bookingDurationMinutes(b);
  }
  const workDayMinutes = (CAL_END - CAL_START) * 60;
  const technicianUtilisation = Object.values(techMinutes)
    .map((t) => ({ ...t, pct: capacityPct(t.minutes, workDayMinutes * 5) }))
    .sort((a, b) => b.pct - a.pct);

  const svcCount: Record<string, { name: string; count: number }> = {};
  for (const b of bookings) {
    if (!b.service_id) continue;
    const id = b.service_id;
    if (!svcCount[id]) svcCount[id] = { name: b.services?.name ?? '—', count: 0 };
    svcCount[id].count += 1;
  }
  const popularServices = Object.values(svcCount).sort((a, b) => b.count - a.count).slice(0, 5);

  const hourCount: Record<number, number> = {};
  for (const b of bookings) {
    const h = new Date(b.scheduled_at).getHours();
    hourCount[h] = (hourCount[h] ?? 0) + 1;
  }
  const peakHours = Object.entries(hourCount)
    .map(([hour, count]) => ({ hour: +hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Booked value of live bookings (cancelled ones are not revenue potential)
  const revenue = active.reduce((sum, b) => sum + bookingValue(b), 0);

  return {
    total: bookings.length,
    completed: completed.length,
    cancelled: cancelled.length,
    avgTurnaroundHours,
    technicianUtilisation,
    popularServices,
    peakHours,
    revenue,
  };
}

export function priorityClass(p: string): string {
  if (p === 'urgent') return 'priority-urgent';
  if (p === 'high') return 'priority-high';
  if (p === 'low') return 'priority-low';
  return 'priority-normal';
}
