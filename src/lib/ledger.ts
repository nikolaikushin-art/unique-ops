/**
 * PAYMENT LEDGER — an invoice is billed to the client, the client pays it (in one go or in parts:
 * deposit, cash, card, transfer). Staff never "pay" an invoice; they RECORD money received.
 * Status, paid date and the booking's payment status are all derived from the ledger here.
 */
import { db } from './localdb';
import { invoiceBalance, invoicePaidAmount, linkInvoicesToBookings, type MetricBooking, type MetricInvoice } from './metrics';
import type { Invoice, InvoicePayment, PaymentMethod } from '../types/database';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
  online: 'Онлайн',
  deposit: 'Предоплата',
};

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pay-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

/** Keeps booking.payment_status equal to what its invoice says. */
async function syncBooking(inv: Invoice): Promise<void> {
  const { data } = await db.from('bookings').select('id, customer_id, service_id, scheduled_at, invoice_id, estimated_value, extra_items, discount, services(name, price)').eq('customer_id', inv.customer_id);
  const bookings = (data ?? []) as unknown as MetricBooking[];
  const links = linkInvoicesToBookings([inv as unknown as MetricInvoice], bookings);
  const paid = invoicePaidAmount(inv);
  const state = inv.status === 'paid' || paid >= Number(inv.amount) - 0.5 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  for (const [bookingId] of links) {
    await db.from('bookings').update({ payment_status: state, invoice_id: inv.id }).eq('id', bookingId);
  }
}

export interface RecordPaymentInput {
  amount: number;
  method: PaymentMethod;
  /** ISO date-time; defaults to now. */
  at?: string;
  note?: string | null;
}

export async function recordPayment(inv: Invoice, input: RecordPaymentInput): Promise<{ error?: string; invoice?: Invoice }> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) return { error: 'Введите сумму больше нуля' };
  const balance = invoiceBalance(inv);
  if (inv.status === 'paid' || balance <= 0.5) return { error: 'Счёт уже полностью оплачен' };
  if (amount > balance + 0.5) return { error: `Сумма больше остатка по счёту (${balance.toLocaleString('ru-RU')} ₽)` };

  const payment: InvoicePayment = { id: newId(), amount, method: input.method, at: input.at ?? new Date().toISOString(), note: input.note || null };
  // legacy invoice: money that was never itemised becomes an explicit ledger line before adding new ones
  const payments = [...(inv.payments ?? []), payment];
  const paidSum = payments.reduce((s, p) => s + p.amount, 0);
  const fullyPaid = paidSum >= Number(inv.amount) - 0.5;

  const patch: Partial<Invoice> = { payments, status: fullyPaid ? 'paid' : 'pending', paid_at: fullyPaid ? payment.at : null };
  const { error } = await db.from('invoices').update(patch).eq('id', inv.id);
  if (error) return { error: error.message };
  const updated = { ...inv, ...patch } as Invoice;
  await syncBooking(updated);
  return { invoice: updated };
}

/** Undo a mistaken payment (admin action). The invoice goes back to «Ожидает оплаты» if it was closed by it. */
export async function revertPayment(inv: Invoice, paymentId: string): Promise<{ error?: string }> {
  const payments = (inv.payments ?? []).filter((p) => p.id !== paymentId);
  const paidSum = payments.reduce((s, p) => s + p.amount, 0);
  const fullyPaid = paidSum >= Number(inv.amount) - 0.5 && payments.length > 0;
  const patch: Partial<Invoice> = { payments, status: fullyPaid ? 'paid' : 'pending', paid_at: fullyPaid ? payments[payments.length - 1].at : null };
  const { error } = await db.from('invoices').update(patch).eq('id', inv.id);
  if (error) return { error: error.message };
  await syncBooking({ ...inv, ...patch } as Invoice);
  return {};
}

/** Next invoice number in the studio's own sequence (INV-0009, INV-0010 …). */
export async function nextInvoiceNumber(): Promise<string> {
  const { data } = await db.from('invoices').select('invoice_number');
  let max = 0;
  for (const r of (data ?? []) as { invoice_number?: string | null }[]) {
    const m = /^INV-(\d+)$/.exec(r.invoice_number ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `INV-${String(max + 1).padStart(4, '0')}`;
}
