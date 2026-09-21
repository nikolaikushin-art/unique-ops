import { db } from './localdb';

export interface PaymentInfo {
  invoice_id: string;
  invoice_number: string;
  description: string | null;
  amount: number;
  status: string;
  due_date: string | null;
  customer_name: string;
  is_payable: boolean;
  demo_mode: boolean;
  payment_url: string;
  provider_label: string;
  latest_payment?: {
    status: string;
    provider: string;
    created_at: string;
    confirmation_url: string | null;
  } | null;
}

export interface CreatePaymentResult {
  ok: boolean;
  error?: string;
  demo?: boolean;
  confirmation_url?: string;
  message?: string;
}

export async function fetchPaymentInfo(invoiceId: string): Promise<PaymentInfo | null> {
  try {
    const { data, error } = await db.functions.invoke('create-payment', {
      body: { invoice_id: invoiceId, action: 'info' },
    });
    if (error || data?.error) return null;
    return data as PaymentInfo;
  } catch {
    return null;
  }
}

export async function createInvoicePayment(
  invoiceId: string,
  customerEmail?: string,
): Promise<CreatePaymentResult> {
  try {
    const { data, error } = await db.functions.invoke('create-payment', {
      body: {
        invoice_id: invoiceId,
        action: 'create',
        customer_email: customerEmail,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    return {
      ok: true,
      demo: data.demo,
      confirmation_url: data.confirmation_url,
      message: data.message,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function confirmDemoPayment(invoiceId: string): Promise<CreatePaymentResult> {
  try {
    const { data, error } = await db.functions.invoke('create-payment', {
      body: { invoice_id: invoiceId, action: 'create', demo_confirm: true },
    });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, demo: true, message: data.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function payPageUrl(invoiceId: string): string {
  return `${window.location.origin}/pay/${invoiceId}`;
}

export async function startInvoicePayment(invoiceId: string, customerEmail?: string): Promise<void> {
  const result = await createInvoicePayment(invoiceId, customerEmail);
  if (!result.ok) throw new Error(result.error || 'Не удалось создать платёж');
  if (result.confirmation_url) {
    window.location.href = result.confirmation_url;
    return;
  }
  throw new Error(result.error || 'URL оплаты не получен');
}
