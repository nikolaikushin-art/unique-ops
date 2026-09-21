import { db } from './localdb';
import { BOOKING_STATUS_LABELS } from './constants';
import type { Booking, BookingStatus } from '../types/database';

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_status_changed'
  | 'booking_completed'
  | 'booking_cancelled'
  | 'job_status_changed'
  | 'manual'
  | 'document'
  | 'reminder_payment'
  | 'reminder_visit'
  | 'thanks';

export function emailTypeToNotifyType(
  type: import('../types/database').EmailMessageType,
): NotificationType {
  if (type === 'document') return 'document';
  if (type === 'reminder_payment') return 'reminder_payment';
  if (type === 'reminder_visit') return 'reminder_visit';
  if (type === 'thanks') return 'thanks';
  return 'manual';
}

const STUDIO_NAME = 'Unique Detailing';

function statusLabel(status: BookingStatus | string): string {
  return BOOKING_STATUS_LABELS[status as BookingStatus] ?? status;
}

export function buildBookingStatusEmail(booking: {
  customer_name: string;
  service_name?: string | null;
  vehicle_label?: string | null;
  scheduled_at?: string | null;
  status: BookingStatus | string;
  previous_status?: BookingStatus | string;
}) {
  const serviceLine = booking.service_name ? `Услуга: ${booking.service_name}` : '';
  const vehicleLine = booking.vehicle_label ? `Автомобиль: ${booking.vehicle_label}` : '';
  const dateLine = booking.scheduled_at
    ? `Дата: ${new Date(booking.scheduled_at).toLocaleString('ru-RU')}`
    : '';
  const statusText = statusLabel(booking.status);

  const subject = `${STUDIO_NAME} — статус заказа: ${statusText}`;
  const body = [
    `Здравствуйте, ${booking.customer_name}!`,
    '',
    booking.previous_status
      ? `Статус вашего заказа изменён: ${statusLabel(booking.previous_status)} → ${statusText}.`
      : `Статус вашего заказа: ${statusText}.`,
    '',
    serviceLine,
    vehicleLine,
    dateLine,
    '',
    'Если у вас есть вопросы, свяжитесь с нами.',
    '',
    `С уважением,`,
    STUDIO_NAME,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, body };
}

/** Opens the default mail program with a filled-in letter. */
export function openMailto(to: string, subject: string, body: string) {
  const a = document.createElement('a');
  a.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function notifyUser(params: {
  customer_id: string;
  type: NotificationType;
  subject: string;
  body: string;
  channel?: 'email' | 'whatsapp';
}): Promise<{ ok: boolean; error?: string; fallback?: boolean; message?: string }> {
  return sendCustomerNotification(params);
}

export async function sendCustomerNotification(params: {
  customer_id: string;
  type: NotificationType;
  subject: string;
  body: string;
  channel?: 'email' | 'whatsapp';
  message_type?: import('../types/database').EmailMessageType;
  /** Manual send from a button: also open the user's mail program with the letter filled in (no server can send it for us). */
  openMailClient?: boolean;
}): Promise<{ ok: boolean; error?: string; fallback?: boolean; message?: string }> {
  try {
    const { data, error } = await db.functions.invoke('send-notification', {
      body: {
        customer_id: params.customer_id,
        type: params.type,
        channel: params.channel ?? 'email',
        subject: params.subject,
        body: params.body,
        message_type: params.message_type,
        open_mail: !!params.openMailClient,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    if (data?.fallback) {
      return { ok: false, fallback: true, message: data.message, error: data.message };
    }
    if (params.openMailClient && (params.channel ?? 'email') === 'email') {
      const { data: cust } = await db.from('customers').select('email').eq('id', params.customer_id).maybeSingle();
      const to = (cust as { email?: string | null } | null)?.email;
      if (!to) return { ok: false, error: 'У клиента не указан email' };
      openMailto(to, params.subject, params.body);
    }
    return { ok: true, message: data?.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function notifyBookingStatusChange(
  booking: Booking,
  previousStatus: BookingStatus,
  options?: { silent?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const customerId = booking.customer_id;
  if (!customerId) return { ok: false, error: 'No customer' };

  const notifyStatuses: BookingStatus[] = [
    'confirmed',
    'vehicle_received',
    'in_progress',
    'quality_check',
    'completed',
    'delivered',
    'cancelled',
  ];
  if (!notifyStatuses.includes(booking.status)) return { ok: true };

  const type: NotificationType =
    booking.status === 'confirmed'
      ? 'booking_confirmed'
      : booking.status === 'cancelled'
        ? 'booking_cancelled'
        : ['completed', 'delivered'].includes(booking.status)
          ? 'booking_completed'
          : 'booking_status_changed';

  const { subject, body } = buildBookingStatusEmail({
    customer_name: booking.customers?.full_name ?? 'Клиент',
    service_name: booking.services?.name,
    vehicle_label: booking.vehicles
      ? `${booking.vehicles.brand} ${booking.vehicles.model}${booking.vehicles.registration_number ? ` · ${booking.vehicles.registration_number}` : ''}`
      : null,
    scheduled_at: booking.scheduled_at,
    status: booking.status,
    previous_status: previousStatus,
  });

  const result = await notifyUser({
    customer_id: customerId,
    type,
    subject,
    body,
  });

  if (!result.ok && !options?.silent && !result.fallback) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
