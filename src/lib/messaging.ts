/**
 * CLIENT MESSAGES — ready templates + one-tap send through WhatsApp / Telegram / e-mail / phone.
 * No server: the app opens the messenger with the text filled in, and logs the message in the client's history.
 */
import { db } from './localdb';
import { getCompany, type CompanyProfile } from './company';
import { bookingTotal } from './orderFlow';
import { invoiceBalance } from './metrics';
import type { Booking, Customer, Invoice, Vehicle } from '../types/database';

export type TemplateId =
  | 'ready' | 'confirm' | 'status' | 'invoice' | 'payment_reminder'
  | 'maintenance' | 'warranty_end' | 'winback' | 'review' | 'birthday' | 'free';

export interface TemplateMeta { id: TemplateId; label: string; type: 'notification' | 'reminder_payment' | 'reminder_visit' | 'thanks' | 'manual' | 'invoice' }

export const TEMPLATES: TemplateMeta[] = [
  { id: 'ready', label: 'Авто готово к выдаче', type: 'notification' },
  { id: 'confirm', label: 'Подтверждение записи', type: 'notification' },
  { id: 'status', label: 'Статус работ', type: 'notification' },
  { id: 'invoice', label: 'Счёт на оплату', type: 'invoice' },
  { id: 'payment_reminder', label: 'Напоминание об оплате', type: 'reminder_payment' },
  { id: 'maintenance', label: 'Пора на обслуживание', type: 'reminder_visit' },
  { id: 'warranty_end', label: 'Гарантия заканчивается', type: 'reminder_visit' },
  { id: 'winback', label: 'Давно не виделись', type: 'reminder_visit' },
  { id: 'review', label: 'Просьба об отзыве', type: 'thanks' },
  { id: 'birthday', label: 'С днём рождения', type: 'thanks' },
  { id: 'free', label: 'Свободный текст', type: 'manual' },
];

export interface MessageContext {
  customer: Customer;
  vehicle?: Vehicle | null;
  booking?: Booking | null;
  invoice?: Invoice | null;
  company: CompanyProfile;
  /** extra facts for reminder templates */
  dueDate?: string | null;
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const d = (v?: string | null) => (v ? new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '');
const t = (v?: string | null) => (v ? new Date(v).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');

const firstName = (full: string) => full.trim().split(/\s+/)[0] || 'клиент';

export function renderTemplate(id: TemplateId, ctx: MessageContext): string {
  const { customer, booking, invoice, company } = ctx;
  const v = ctx.vehicle ?? booking?.vehicles ?? null;
  const car = v ? `${v.brand} ${v.model}` : 'автомобиль';
  const name = firstName(customer.full_name);
  const svc = booking?.services?.name ?? invoice?.description ?? 'работы';
  const studio = company.name;
  const contacts = [company.address, company.phone].filter(Boolean).join(', ');
  const sign = `\n— ${studio}${contacts ? `\n${contacts}` : ''}`;
  switch (id) {
    case 'ready':
      {
      const due = invoice ? invoiceBalance(invoice) : booking ? Math.max(0, bookingTotal(booking) - Number(booking.deposit ?? 0)) : 0;
      const pay = !booking && !invoice ? '' : due > 0 ? ` К оплате: ${rub(due)}.` : ' Оплата получена.';
      return `Здравствуйте, ${name}! Ваш ${car} готов к выдаче.${pay} Приезжайте в удобное время, мы на месте.${sign}`;
    }
    case 'confirm':
      return `Здравствуйте, ${name}! Подтверждаем запись: ${svc}, ${car} — ${d(booking?.scheduled_at)} в ${t(booking?.scheduled_at)}.${booking?.deposit ? ` Предоплата ${rub(Number(booking.deposit))} получена.` : ''} Если планы изменятся — напишите нам.${sign}`;
    case 'status':
      return `Здравствуйте, ${name}! По вашему ${car}: работы идут по плану${booking?.eta_at ? `, готовность — ${d(booking.eta_at)} около ${t(booking.eta_at)}` : ''}. Сообщим, как только всё будет готово.${sign}`;
    case 'invoice':
      return `Здравствуйте, ${name}! Выставили счёт ${invoice?.invoice_number ?? ''} на ${rub(Number(invoice?.amount ?? 0))} (${invoice?.description ?? svc}).${invoice?.due_date ? ` Срок оплаты — ${d(invoice.due_date)}.` : ''}${company.bank_name ? `\nРеквизиты: ${company.legal_name || company.name}${company.inn ? `, ИНН ${company.inn}` : ''}, ${company.bank_name}${company.bik ? `, БИК ${company.bik}` : ''}, р/с ${company.account}.` : ''}${sign}`;
    case 'payment_reminder':
      return `Здравствуйте, ${name}! Напоминаем про счёт ${invoice?.invoice_number ?? ''}: остаток к оплате ${rub(invoice ? invoiceBalance(invoice) : 0)}${invoice?.due_date ? `, срок был ${d(invoice.due_date)}` : ''}. Если уже оплатили — просто ответьте, мы проверим.${sign}`;
    case 'maintenance':
      return `Здравствуйте, ${name}! Пора на плановое обслуживание вашего ${car}${booking?.services?.name ? ` (${booking.services.name})` : ''}${ctx.dueDate ? ` — рекомендуем до ${d(ctx.dueDate)}` : ''}. Своевременный уход сохраняет гарантию и внешний вид. Подобрать время?${sign}`;
    case 'warranty_end':
      return `Здравствуйте, ${name}! Гарантия на ${booking?.services?.name ?? 'работы'} для ${car} заканчивается${ctx.dueDate ? ` ${d(ctx.dueDate)}` : ' в ближайшее время'}. Предлагаем бесплатный осмотр покрытия — запишем вас?${sign}`;
    case 'winback':
      return `Здравствуйте, ${name}! Давно не виделись. Как ваш ${car}? Могу предложить осмотр и подобрать уход под сезон. Когда вам удобно заехать?${sign}`;
    case 'review':
      return `Здравствуйте, ${name}! Спасибо, что выбрали ${studio}. Если результат вам понравился — будем очень благодарны за отзыв${company.review_url ? `: ${company.review_url}` : ''}. Это помогает нам развиваться.${sign}`;
    case 'birthday':
      return `${name}, поздравляем вас с днём рождения! Желаем безупречных дорог и всегда блестящего автомобиля. Ваш ${studio}.`;
    default:
      return `Здравствуйте, ${name}! `;
  }
}

/** Digits-only international phone (Russia: 8 900… / 900… → 7900…). */
export function normalizePhone(raw?: string | null): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

export type Channel = 'whatsapp' | 'telegram' | 'email' | 'phone';

export function channelLink(channel: Channel, customer: Customer, text: string): string | null {
  const phone = normalizePhone(customer.phone);
  if (channel === 'whatsapp') return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;
  if (channel === 'telegram') return phone ? `https://t.me/+${phone}` : null;
  if (channel === 'email') return customer.email ? `mailto:${customer.email}?subject=${encodeURIComponent(getCompany().name)}&body=${encodeURIComponent(text)}` : null;
  return phone ? `tel:+${phone}` : null;
}

/** Records the message in the client's communication history. */
export async function logCommunication(opts: { customer: Customer; channel: Channel; content: string; template: TemplateMeta; entityId?: string | null; createdBy?: string | null }) {
  await db.from('communications').insert({
    customer_id: opts.customer.id,
    channel: opts.channel,
    direction: 'outbound',
    content: opts.content,
    body_text: opts.content,
    subject: opts.template.label,
    recipient_email: opts.channel === 'email' ? opts.customer.email : null,
    email_status: opts.channel === 'email' ? 'sent' : null,
    message_type: opts.template.type,
    entity_id: opts.entityId ?? null,
    created_by: opts.createdBy ?? null,
  });
}

export const CHANNEL_LABELS: Record<Channel, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Email', phone: 'Позвонить' };
