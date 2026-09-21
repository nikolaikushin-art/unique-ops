import { db } from './localdb';
import { getCompany } from './company';
import { renderTemplate, logCommunication, TEMPLATES } from './messaging';
import { openMailto } from './notifications';
import type { Customer, Invoice } from '../types/database';

export interface SendInvoiceResult {
  ok: boolean;
  error?: string;
  message?: string;
  recipient?: string;
  sent_at?: string;
}

export function invoiceCustomerEmail(inv: Invoice): string | null {
  return inv.customers?.email?.trim() || null;
}

export async function sendInvoiceToCustomer(invoiceId: string): Promise<SendInvoiceResult> {
  try {
    const { data, error } = await db.functions.invoke('send-invoice', {
      body: { invoice_id: invoiceId },
    });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    // no mail server in this build: open the user's mail program with the invoice text and log it in the client's history
    const { data: row } = await db.from('invoices').select('*, customers(*)').eq('id', invoiceId).maybeSingle();
    const inv = row as Invoice | null;
    const customer = inv?.customers as Customer | undefined;
    if (inv && customer?.email) {
      const text = renderTemplate('invoice', { customer, invoice: inv, company: getCompany() });
      openMailto(customer.email, `Счёт ${inv.invoice_number} — ${getCompany().name}`, text);
      await logCommunication({ customer, channel: 'email', content: text, template: TEMPLATES.find((t) => t.id === 'invoice')!, entityId: inv.id });
    }
    return {
      ok: true,
      message: 'Письмо со счётом открыто в вашей почтовой программе. Прикрепите PDF (кнопка «Счёт PDF») и отправьте.',
      recipient: data?.recipient,
      sent_at: data?.sent_at,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
