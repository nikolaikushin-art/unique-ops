/**
 * ORDER FLOW — booking → order → invoice, joined by real ids (booking.order_id, booking.invoice_id,
 * invoice.booking_id). A deposit paid at booking time becomes the first line of the invoice's payment ledger.
 */
import { db } from './localdb';
import { bookingValue } from './metrics';
import { nextInvoiceNumber } from './ledger';
import type { Booking, InvoicePayment } from '../types/database';

export interface BookingLine { name: string; qty: number; price: number }

/** Human-readable lines of an order: main service, extras, discount. */
export function bookingLines(b: Booking): BookingLine[] {
  const lines: BookingLine[] = [];
  const base = b.estimated_value != null && Number(b.estimated_value) > 0 ? Number(b.estimated_value) : Number(b.services?.price ?? 0);
  if (b.services?.name || base) lines.push({ name: b.services?.name ?? 'Работы', qty: 1, price: base });
  for (const x of b.extra_items ?? []) lines.push({ name: x.name, qty: Number(x.quantity ?? 1), price: Number(x.price) });
  if (Number(b.discount ?? 0) > 0) lines.push({ name: 'Скидка', qty: 1, price: -Number(b.discount) });
  return lines;
}

export const bookingTotal = (b: Booking) => bookingValue(b as never);

export async function createOrderAndInvoice(bookingId: string): Promise<{ orderId?: string; invoiceId?: string; error?: string; created: { order: boolean; invoice: boolean } }> {
  const created = { order: false, invoice: false };
  const { data: bk, error: bkErr } = await db.from('bookings').select('*, customers(*), vehicles(*), services(*)').eq('id', bookingId).single();
  if (bkErr || !bk) return { error: bkErr?.message ?? 'Бронь не найдена', created };
  let booking = bk as Booking;

  // 1. order
  let orderId = booking.order_id ?? undefined;
  if (!orderId) {
    const { data: existing } = await db.from('orders').select('id').eq('booking_id', bookingId).maybeSingle();
    orderId = (existing as { id: string } | null)?.id;
  }
  if (!orderId) {
    const { data, error } = await db.rpc('create_order_from_booking', { p_booking_id: bookingId });
    if (error) return { error: error.message, created };
    orderId = String(data);
    created.order = true;
  }

  // 2. invoice
  const { data: reload } = await db.from('bookings').select('*, customers(*), vehicles(*), services(*)').eq('id', bookingId).single();
  booking = (reload as Booking) ?? booking;
  let invoiceId = booking.invoice_id ?? undefined;
  if (!invoiceId) {
    const { data: existing } = await db.from('invoices').select('id').eq('booking_id', bookingId).maybeSingle();
    invoiceId = (existing as { id: string } | null)?.id;
  }
  if (!invoiceId) {
    const amount = bookingTotal(booking);
    const deposit = Math.min(Number(booking.deposit ?? 0), amount);
    const payments: InvoicePayment[] = deposit > 0
      ? [{ id: `dep-${bookingId.slice(0, 8)}`, amount: deposit, method: 'deposit', at: booking.created_at, note: 'Предоплата при записи' }]
      : [];
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const description = bookingLines(booking).filter((l) => l.price > 0).map((l) => l.name).join(' + ') || 'Работы';
    const fully = deposit >= amount - 0.5 && amount > 0;
    const { data, error } = await db.from('invoices').insert({
      invoice_number: await nextInvoiceNumber(),
      customer_id: booking.customer_id,
      order_id: orderId,
      booking_id: bookingId,
      description,
      amount,
      status: fully ? 'paid' : 'pending',
      due_date: due,
      payments,
      paid_at: fully ? booking.created_at : null,
    }).select('id').single();
    if (error) return { orderId, error: error.message, created };
    invoiceId = (data as { id: string }).id;
    created.invoice = true;
  }

  // 3. hard links + payment status on the booking
  const { data: inv } = await db.from('invoices').select('*').eq('id', invoiceId).single();
  const paid = ((inv as { payments?: InvoicePayment[] } | null)?.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const total = Number((inv as { amount?: number } | null)?.amount ?? 0);
  await db.from('bookings').update({
    order_id: orderId,
    invoice_id: invoiceId,
    payment_status: paid >= total - 0.5 && total > 0 ? 'paid' : paid > 0 ? 'partial' : booking.payment_status,
  }).eq('id', bookingId);
  await db.from('orders').update({ invoice_status: paid >= total - 0.5 && total > 0 ? 'paid' : 'pending' }).eq('id', orderId);
  return { orderId, invoiceId, created };
}
