/**
 * CANONICAL METRIC DEFINITIONS — single source of truth.
 *
 * Every screen (Overview, Finance, Reports, Bookings, Jobs, Warehouse …) must
 * take its numbers from here, so the same label always means the same thing.
 * The "Сверка данных" panel in Reports checks the data against these rules.
 */
import { inRange, startOfDay, type DateRange } from './analytics';
import { unwrapRelation } from './relations';

export interface MetricInvoice {
  id?: string;
  amount: number | string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  due_date?: string | null;
  customer_id?: string | null;
  description?: string | null;
  /** Hard link to the booking this invoice bills. */
  booking_id?: string | null;
  /** Payment ledger — each received payment (partial payments supported). */
  payments?: { amount: number | string; at: string }[] | null;
}

export interface MetricBooking {
  id?: string;
  status: string;
  scheduled_at: string;
  completed_at?: string | null;
  eta_at?: string | null;
  payment_status?: string | null;
  customer_id?: string | null;
  service_id?: string | null;
  estimated_value?: number | string | null;
  invoice_id?: string | null;
  extra_items?: { price: number | string; quantity?: number | string }[] | null;
  discount?: number | string | null;
  services?: { name?: string; price?: number | string } | { name?: string; price?: number | string }[] | null;
}

export const DONE_STATUSES = ['completed', 'delivered'] as const;
export const isDoneStatus = (s: string) => (DONE_STATUSES as readonly string[]).includes(s);
export const isFinalStatus = (s: string) => isDoneStatus(s) || s === 'cancelled';

type ValueInput = Pick<MetricBooking, 'estimated_value' | 'services'> & Partial<Pick<MetricBooking, 'extra_items' | 'discount'>>;

/** Main service price: agreed/estimated value first, catalogue price as fallback. */
export function bookingBaseValue(b: Pick<MetricBooking, 'estimated_value' | 'services'>): number {
  if (b.estimated_value !== null && b.estimated_value !== undefined && Number(b.estimated_value) > 0) return Number(b.estimated_value);
  const svc = unwrapRelation(b.services as { price?: number } | { price?: number }[] | null | undefined);
  return Number(svc?.price ?? 0);
}

/** Sum of the extra (upsell) lines. */
export function bookingExtrasTotal(b: Partial<Pick<MetricBooking, 'extra_items'>>): number {
  return (b.extra_items ?? []).reduce((s, x) => s + Number(x.price || 0) * Number(x.quantity ?? 1), 0);
}

/** Value of a whole order: main service + extra lines − discount. */
export function bookingValue(b: ValueInput): number {
  return Math.max(0, bookingBaseValue(b) + bookingExtrasTotal(b) - Number(b.discount ?? 0));
}

export const serviceName = (b: Pick<MetricBooking, 'services'>): string =>
  unwrapRelation(b.services as { name?: string } | { name?: string }[] | null | undefined)?.name ?? '';

/** Moment a job counts as "done": completion time, else its scheduled time. */
export const doneAt = (b: Pick<MetricBooking, 'completed_at' | 'scheduled_at'>): string => b.completed_at ?? b.scheduled_at;

/** Completed / delivered jobs whose done-date falls in the range. */
export function completedIn<T extends MetricBooking>(bookings: T[], range: DateRange): T[] {
  return bookings.filter((b) => isDoneStatus(b.status) && inRange(doneAt(b), range));
}

/** Average check = value of completed jobs / number of completed jobs. */
export function averageCheck(completed: MetricBooking[]): number {
  if (!completed.length) return 0;
  return completed.reduce((s, b) => s + bookingValue(b), 0) / completed.length;
}

/* ---------------- invoice ↔ booking linking ---------------- */

const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const time = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * Pairs each invoice with at most one booking of the same customer and the same
 * service (matched by service name = invoice description). Amount match wins,
 * then the closest date. Returns bookingId → invoiceId.
 */
export function linkInvoicesToBookings(invoices: MetricInvoice[], bookings: MetricBooking[]): Map<string, string> {
  const links = new Map<string, string>();
  const bookingIds = new Set(bookings.map((b) => b.id).filter(Boolean) as string[]);
  const linkedInvoices = new Set<string>();

  // 1) hard links first — invoice.booking_id or booking.invoice_id
  for (const inv of invoices) {
    if (inv.id && inv.booking_id && bookingIds.has(inv.booking_id) && !links.has(inv.booking_id)) {
      links.set(inv.booking_id, inv.id);
      linkedInvoices.add(inv.id);
    }
  }
  const invIds = new Set(invoices.map((i) => i.id).filter(Boolean) as string[]);
  for (const b of bookings) {
    if (b.id && b.invoice_id && invIds.has(b.invoice_id) && !links.has(b.id) && !linkedInvoices.has(b.invoice_id)) {
      links.set(b.id, b.invoice_id);
      linkedInvoices.add(b.invoice_id);
    }
  }

  // 2) legacy fallback for old data without hard links: same customer + same service name
  const sorted = [...invoices].filter((i) => i.id && !linkedInvoices.has(i.id)).sort((a, b) => time(a.created_at) - time(b.created_at));
  for (const inv of sorted) {
    const candidates = bookings.filter(
      (b) => b.id && !links.has(b.id) && b.customer_id && b.customer_id === inv.customer_id && norm(serviceName(b)) === norm(inv.description)
    );
    if (!candidates.length) continue;
    candidates.sort(
      (a, b) =>
        (bookingValue(a) === Number(inv.amount) ? 0 : 1) - (bookingValue(b) === Number(inv.amount) ? 0 : 1) ||
        Math.abs(time(a.scheduled_at) - time(inv.created_at)) - Math.abs(time(b.scheduled_at) - time(inv.created_at))
    );
    links.set(candidates[0].id!, inv.id!);
  }
  return links;
}

/* ---------------- invoice payment ledger ---------------- */

/** Money received on an invoice: ledger sum, or the full amount for a legacy invoice just marked paid. */
export function invoicePaidAmount(inv: Pick<MetricInvoice, 'amount' | 'status' | 'payments'>): number {
  if (inv.status === 'paid') return Number(inv.amount);
  return (inv.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
}

/** What the client still owes on this invoice. */
export function invoiceBalance(inv: Pick<MetricInvoice, 'amount' | 'status' | 'payments'>): number {
  return Math.max(0, Number(inv.amount) - invoicePaidAmount(inv));
}

/* ---------------- revenue (cash basis) ---------------- */

export interface RevenueEvent {
  /** When the money was received. */
  at: string;
  amount: number;
  source: 'invoice' | 'booking';
  refId: string;
}

/**
 * Revenue = money actually received.
 *  • a paid invoice counts at its payment date (paid_at, else created_at);
 *  • a booking marked "paid" counts at its done-date — but ONLY if no invoice is
 *    linked to it (otherwise the same work would be counted twice; the invoice
 *    is the financial document and wins);
 *  • partial payments count as soon as they are recorded in the invoice's payment ledger.
 */
export function buildRevenueEvents(invoices: MetricInvoice[], bookings: MetricBooking[]): RevenueEvent[] {
  const links = linkInvoicesToBookings(invoices, bookings);
  const events: RevenueEvent[] = [];
  for (const inv of invoices) {
    const ledger = inv.payments ?? [];
    if (ledger.length) {
      // every real payment counts on its own date (partial payments included)
      for (const p of ledger) events.push({ at: p.at, amount: Number(p.amount), source: 'invoice', refId: inv.id ?? '' });
      const rest = inv.status === 'paid' ? Number(inv.amount) - ledger.reduce((s, p) => s + Number(p.amount || 0), 0) : 0;
      if (rest > 0.5) events.push({ at: inv.paid_at ?? inv.created_at, amount: rest, source: 'invoice', refId: inv.id ?? '' });
      continue;
    }
    if (inv.status !== 'paid') continue;
    events.push({ at: inv.paid_at ?? inv.created_at, amount: Number(inv.amount), source: 'invoice', refId: inv.id ?? '' });
  }
  for (const b of bookings) {
    if (b.payment_status !== 'paid') continue;
    if (b.id && links.has(b.id)) continue;
    events.push({ at: doneAt(b), amount: bookingValue(b), source: 'booking', refId: b.id ?? '' });
  }
  return events;
}

export function revenueIn(events: RevenueEvent[], range: DateRange): number {
  return events.reduce((s, e) => (inRange(e.at, range) ? s + e.amount : s), 0);
}

/* ---------------- receivables ---------------- */

/** "К оплате" = what is still owed on every invoice that is not fully paid. */
export function outstandingAmount(invoices: MetricInvoice[]): number {
  return invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + invoiceBalance(i), 0);
}

/** Overdue = flagged overdue, or still pending with a due date before today. */
export function isInvoiceOverdue(inv: MetricInvoice, now = new Date()): boolean {
  if (inv.status === 'overdue') return true;
  if (inv.status !== 'pending' || !inv.due_date) return false;
  return new Date(inv.due_date).getTime() < startOfDay(now).getTime();
}

export const overdueInvoiceList = <T extends MetricInvoice>(invoices: T[], now = new Date()): T[] => invoices.filter((i) => isInvoiceOverdue(i, now));

/* ---------------- operations ---------------- */

/** Delayed = not finished and its promised time (ETA, else scheduled time) has passed. */
export function isJobDelayed(b: MetricBooking, now = new Date()): boolean {
  if (isFinalStatus(b.status)) return false;
  const eta = b.eta_at ?? b.scheduled_at;
  return !!eta && new Date(eta).getTime() < now.getTime();
}

export const isJobActive = (b: MetricBooking) => !isFinalStatus(b.status);
