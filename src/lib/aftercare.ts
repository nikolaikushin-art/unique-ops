/**
 * AFTERCARE — the daily «who to contact today» list: cars ready for pickup, unpaid invoices, coating
 * maintenance and warranty deadlines, clients who have not visited for 90+ days, birthdays.
 * Everything is derived from the data; nothing is stored.
 */
import { invoiceBalance, isInvoiceOverdue, isDoneStatus, type MetricInvoice } from './metrics';
import type { TemplateId } from './messaging';
import type { Booking, Customer, Invoice } from '../types/database';

export type AftercareKind = 'ready' | 'invoice' | 'maintenance' | 'warranty' | 'winback' | 'birthday';

export interface AftercareItem {
  id: string;
  kind: AftercareKind;
  customerId: string;
  bookingId?: string;
  invoiceId?: string;
  template: TemplateId;
  title: string;
  sub: string;
  due?: string;
  /** lower = more urgent */
  rank: number;
}

export const AFTERCARE_LABELS: Record<AftercareKind, string> = {
  ready: 'Готово к выдаче',
  invoice: 'Счёт не оплачен',
  maintenance: 'Пора на обслуживание',
  warranty: 'Гарантия заканчивается',
  winback: 'Давно не были',
  birthday: 'День рождения',
};

const DAY = 86400000;
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const fmtD = (d: Date | string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

export function buildAftercare(customers: Customer[], bookings: Booking[], invoices: Invoice[], now = new Date()): AftercareItem[] {
  const out: AftercareItem[] = [];
  const cust = new Map(customers.map((c) => [c.id, c]));
  const car = (b: Booking) => (b.vehicles ? `${b.vehicles.brand} ${b.vehicles.model}` : 'Авто');

  // cars ready for pickup
  for (const b of bookings) {
    if (b.status !== 'completed') continue;
    out.push({ id: `ready-${b.id}`, kind: 'ready', customerId: b.customer_id, bookingId: b.id, template: 'ready', title: `${car(b)} · ${cust.get(b.customer_id)?.full_name ?? '—'}`, sub: 'Работы завершены — сообщите клиенту', rank: 0 });
  }

  // unpaid invoices
  for (const inv of invoices) {
    if (inv.status === 'paid') continue;
    const overdue = isInvoiceOverdue(inv as unknown as MetricInvoice, now);
    if (!overdue) continue;
    out.push({ id: `inv-${inv.id}`, kind: 'invoice', customerId: inv.customer_id, invoiceId: inv.id, bookingId: inv.booking_id ?? undefined, template: 'payment_reminder', title: `${inv.invoice_number} · ${cust.get(inv.customer_id)?.full_name ?? inv.customers?.full_name ?? '—'}`, sub: `Просрочен, остаток ${rub(invoiceBalance(inv as unknown as MetricInvoice))}`, rank: 1 });
  }

  // maintenance + warranty from completed jobs
  const done = bookings.filter((b) => isDoneStatus(b.status));
  for (const b of done) {
    const s = b.services;
    if (!s) continue;
    const at = new Date(b.completed_at ?? b.scheduled_at);
    const maint = Number(s.maintenance_interval_months ?? 0);
    if (maint > 0) {
      const due = addMonths(at, maint);
      const revisited = done.some((o) => o.id !== b.id && o.vehicle_id === b.vehicle_id && o.service_id === b.service_id && new Date(o.completed_at ?? o.scheduled_at).getTime() > at.getTime());
      if (!revisited && due.getTime() - now.getTime() <= 14 * DAY) {
        out.push({ id: `maint-${b.id}`, kind: 'maintenance', customerId: b.customer_id, bookingId: b.id, template: 'maintenance', due: due.toISOString(), title: `${car(b)} · ${s.name}`, sub: due.getTime() < now.getTime() ? `Срок был ${fmtD(due)}` : `Рекомендуем до ${fmtD(due)}`, rank: due.getTime() < now.getTime() ? 2 : 3 });
      }
    }
    const warr = Number(s.warranty_months ?? 0);
    if (warr > 0) {
      const end = addMonths(at, warr);
      const left = end.getTime() - now.getTime();
      if (left >= 0 && left <= 30 * DAY) {
        out.push({ id: `warr-${b.id}`, kind: 'warranty', customerId: b.customer_id, bookingId: b.id, template: 'warranty_end', due: end.toISOString(), title: `${car(b)} · ${s.name}`, sub: `Гарантия до ${fmtD(end)}`, rank: 4 });
      }
    }
  }

  // dormant clients (no visit for 90+ days, not already in the list)
  const contacted = new Set(out.map((o) => o.customerId));
  const dormant = customers
    .filter((c) => c.last_visit_at && now.getTime() - new Date(c.last_visit_at).getTime() > 90 * DAY && !contacted.has(c.id))
    .sort((a, b) => new Date(a.last_visit_at!).getTime() - new Date(b.last_visit_at!).getTime())
    .slice(0, 5);
  for (const c of dormant) {
    const days = Math.floor((now.getTime() - new Date(c.last_visit_at!).getTime()) / DAY);
    out.push({ id: `win-${c.id}`, kind: 'winback', customerId: c.id, template: 'winback', title: c.full_name, sub: `Не было ${days} дн.`, rank: 6 });
  }

  // birthdays in the next 7 days
  for (const c of customers) {
    if (!c.birthday) continue;
    const b = new Date(c.birthday);
    const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
    if (next.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) next.setFullYear(now.getFullYear() + 1);
    const days = Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
    if (days <= 7) out.push({ id: `bd-${c.id}`, kind: 'birthday', customerId: c.id, template: 'birthday', title: c.full_name, sub: days === 0 ? 'Сегодня день рождения' : `День рождения ${fmtD(next)}`, rank: 5 });
  }

  return out.sort((a, b) => a.rank - b.rank);
}
