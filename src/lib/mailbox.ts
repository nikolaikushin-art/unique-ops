import { db } from './localdb';
import type { Booking, Communication, Customer, EmailMessageType, Invoice, Vehicle } from '../types/database';

export type MailIconName =
  | 'compose' | 'inbox' | 'enquiry' | 'booking' | 'quote' | 'estimate' | 'confirmation'
  | 'invoice' | 'payment' | 'membership' | 'warranty' | 'supplier' | 'team' | 'sent' | 'drafts'
  | 'archive' | 'trash' | 'spam';

export const EMAIL_TYPE_LABELS: Record<EmailMessageType, string> = {
  invoice: 'Счёт',
  notification: 'Уведомление',
  manual: 'Сообщение',
  document: 'Документы',
  reminder_payment: 'Напоминание об оплате',
  reminder_visit: 'Напоминание о визите',
  thanks: 'Благодарность',
  enquiry: 'Запрос клиента',
  booking_request: 'Бронирование',
  quote: 'КП',
  estimate: 'Смета',
  service_confirmation: 'Подтверждение',
  payment: 'Платёж',
  membership: 'Абонемент',
  warranty: 'Гарантия',
  supplier: 'Поставщик',
  internal: 'Команда',
};

export const EMAIL_STATUS_LABELS: Record<'sent' | 'failed' | 'read' | 'draft', string> = {
  sent: 'Отправлено',
  failed: 'Ошибка',
  read: 'Прочитано',
  draft: 'Черновик',
};

export type MailFolder =
  | 'inbox'
  | 'enquiry'
  | 'booking_request'
  | 'quote'
  | 'estimate'
  | 'service_confirmation'
  | 'invoice'
  | 'payment'
  | 'membership'
  | 'warranty'
  | 'supplier'
  | 'internal'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'trash'
  | 'spam';

export interface MailFolderDef {
  id: MailFolder;
  labelRu: string;
  labelEn: string;
  icon: MailIconName;
  section: 'primary' | 'system';
  /** Sub-grouping inside the primary section so 12 flat rows don't read as
   *  one wall of text — Inbox stays alone up top, everything else clusters
   *  into a few bordered, labelled cards (Settings-page pattern). */
  group?: string;
}

export const MAIL_FOLDERS: MailFolderDef[] = [
  { id: 'inbox', labelRu: 'Входящие', labelEn: 'Inbox', icon: 'inbox', section: 'primary' },
  { id: 'enquiry', labelRu: 'Запросы клиентов', labelEn: 'Customer Enquiries', icon: 'enquiry', section: 'primary', group: 'Клиенты' },
  { id: 'booking_request', labelRu: 'Бронирования', labelEn: 'Booking Requests', icon: 'booking', section: 'primary', group: 'Клиенты' },
  { id: 'service_confirmation', labelRu: 'Подтверждения', labelEn: 'Service Confirmations', icon: 'confirmation', section: 'primary', group: 'Клиенты' },
  { id: 'quote', labelRu: 'КП', labelEn: 'Quotes', icon: 'quote', section: 'primary', group: 'Документы и оплата' },
  { id: 'estimate', labelRu: 'Сметы', labelEn: 'Estimates', icon: 'estimate', section: 'primary', group: 'Документы и оплата' },
  { id: 'invoice', labelRu: 'Счета', labelEn: 'Invoices', icon: 'invoice', section: 'primary', group: 'Документы и оплата' },
  { id: 'payment', labelRu: 'Платежи', labelEn: 'Payments', icon: 'payment', section: 'primary', group: 'Документы и оплата' },
  { id: 'membership', labelRu: 'Абонементы', labelEn: 'Memberships', icon: 'membership', section: 'primary', group: 'Прочее' },
  { id: 'warranty', labelRu: 'Гарантия', labelEn: 'Warranty', icon: 'warranty', section: 'primary', group: 'Прочее' },
  { id: 'supplier', labelRu: 'Поставщики', labelEn: 'Suppliers', icon: 'supplier', section: 'primary', group: 'Прочее' },
  { id: 'internal', labelRu: 'Команда', labelEn: 'Internal Team', icon: 'team', section: 'primary', group: 'Прочее' },
  { id: 'sent', labelRu: 'Исходящие', labelEn: 'Sent', icon: 'sent', section: 'system' },
  { id: 'drafts', labelRu: 'Черновики', labelEn: 'Drafts', icon: 'drafts', section: 'system' },
  { id: 'archive', labelRu: 'Архив', labelEn: 'Archive', icon: 'archive', section: 'system' },
  { id: 'trash', labelRu: 'Корзина', labelEn: 'Trash', icon: 'trash', section: 'system' },
  { id: 'spam', labelRu: 'Спам', labelEn: 'Spam', icon: 'spam', section: 'system' },
];

export function folderLabelRu(folder: MailFolder): string {
  return MAIL_FOLDERS.find((f) => f.id === folder)?.labelRu ?? folder;
}

const FOLDER_MESSAGE_TYPES: Partial<Record<MailFolder, EmailMessageType[]>> = {
  enquiry: ['enquiry', 'manual', 'notification'],
  booking_request: ['booking_request', 'notification'],
  quote: ['quote', 'document'],
  estimate: ['estimate', 'document'],
  service_confirmation: ['service_confirmation', 'notification'],
  invoice: ['invoice'],
  payment: ['payment', 'reminder_payment'],
  membership: ['membership'],
  warranty: ['warranty'],
  supplier: ['supplier'],
  internal: ['internal'],
};

export interface MailboxMessage extends Communication {
  customers?: Pick<Customer, 'id' | 'full_name' | 'email' | 'phone'>;
  sender?: { id: string; full_name: string } | null;
  vehicle?: Pick<Vehicle, 'id' | 'brand' | 'model' | 'registration_number'> | null;
  is_important?: boolean;
  is_draft?: boolean;
  is_archived?: boolean;
  is_deleted?: boolean;
  is_spam?: boolean;
  attachment_keys?: string[] | null;
}

export interface MailboxFilters {
  search: string;
  customerId: string;
  type: EmailMessageType | '';
  dateFrom: string;
  dateTo: string;
  status: 'all' | 'sent' | 'failed' | 'read' | 'unread' | 'draft';
}

export interface MailboxStats {
  sentToday: number;
  failed: number;
  total: number;
  unread: number;
}

export type DateGroup = 'today' | 'yesterday' | 'earlier';

export interface DateGroupedMessages {
  group: DateGroup;
  label: string;
  messages: MailboxMessage[];
}

export const DATE_GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  earlier: 'Ранее',
};

export const DEFAULT_MAILBOX_FILTERS: MailboxFilters = {
  search: '',
  customerId: '',
  type: '',
  dateFrom: '',
  dateTo: '',
  status: 'all',
};

export interface EmailTemplate {
  id: string;
  label: string;
  type: EmailMessageType;
  subject: string;
  body: string;
}

export interface CustomerMailContext {
  customer: Pick<Customer, 'id' | 'full_name' | 'email' | 'phone' | 'visit_count' | 'notes'>;
  vehicles: Pick<Vehicle, 'id' | 'brand' | 'model' | 'registration_number' | 'year' | 'color'>[];
  activeBookings: Pick<Booking, 'id' | 'scheduled_at' | 'status' | 'bay'>[];
  outstandingInvoices: Pick<Invoice, 'id' | 'invoice_number' | 'amount' | 'status' | 'due_date'>[];
  servicesCount: number;
}

const STUDIO_NAME = 'Unique Detailing';

export function buildEmailTemplates(customerName = 'Клиент'): EmailTemplate[] {
  return [
    {
      id: 'reminder_payment',
      label: 'Напоминание об оплате',
      type: 'reminder_payment',
      subject: `${STUDIO_NAME} — напоминание об оплате`,
      body: [
        `Здравствуйте, ${customerName}!`,
        '',
        'Напоминаем, что по вашему заказу ожидается оплата.',
        'Пожалуйста, свяжитесь с нами, если у вас возникли вопросы.',
        '',
        'С уважением,',
        STUDIO_NAME,
      ].join('\n'),
    },
    {
      id: 'reminder_visit',
      label: 'Напоминание о визите',
      type: 'reminder_visit',
      subject: `${STUDIO_NAME} — напоминание о визите`,
      body: [
        `Здравствуйте, ${customerName}!`,
        '',
        'Напоминаем о вашем запланированном визите в студию.',
        'Пожалуйста, подтвердите дату и время или свяжитесь с нами для переноса.',
        '',
        'С уважением,',
        STUDIO_NAME,
      ].join('\n'),
    },
    {
      id: 'thanks',
      label: 'Благодарность',
      type: 'thanks',
      subject: `${STUDIO_NAME} — благодарим за визит`,
      body: [
        `Здравствуйте, ${customerName}!`,
        '',
        'Благодарим вас за доверие и визит в нашу студию.',
        'Будем рады видеть вас снова!',
        '',
        'С уважением,',
        STUDIO_NAME,
      ].join('\n'),
    },
    {
      id: 'quote_followup',
      label: 'Follow-up по КП',
      type: 'quote',
      subject: `${STUDIO_NAME} — ваше коммерческое предложение`,
      body: [
        `Здравствуйте, ${customerName}!`,
        '',
        'Напоминаем о направленном коммерческом предложении.',
        'Готовы ответить на вопросы и согласовать удобное время визита.',
        '',
        'С уважением,',
        STUDIO_NAME,
      ].join('\n'),
    },
  ];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function messagePreview(msg: MailboxMessage): string {
  if (msg.body_text?.trim()) return msg.body_text.trim().slice(0, 200);
  const text = msg.content?.trim() ?? '';
  return text.slice(0, 200) || '—';
}

export function messageSubject(msg: MailboxMessage): string {
  if (msg.subject?.trim()) return msg.subject.trim();
  const first = msg.content?.split('\n')[0]?.trim();
  return first || 'Без темы';
}

export function displayStatus(msg: MailboxMessage): 'sent' | 'failed' | 'read' | 'draft' {
  if (msg.is_draft) return 'draft';
  if (msg.read_at) return 'read';
  if (msg.email_status === 'failed') return 'failed';
  return 'sent';
}

export function senderLabel(msg: MailboxMessage): string {
  if (msg.sender?.full_name) return msg.sender.full_name;
  if (msg.sender_email) return msg.sender_email;
  return 'Система';
}

export function recipientLabel(msg: MailboxMessage): string {
  return msg.recipient_email || msg.customers?.email || msg.customers?.full_name || '—';
}

export function partyLabel(msg: MailboxMessage, folder: MailFolder): string {
  if (folder === 'sent' || folder === 'drafts') return recipientLabel(msg);
  return msg.customers?.full_name || senderLabel(msg);
}

export function vehicleLabel(v?: Pick<Vehicle, 'registration_number' | 'brand' | 'model'> | null): string | null {
  if (!v) return null;
  const reg = v.registration_number?.trim();
  const model = [v.brand, v.model].filter(Boolean).join(' ').trim();
  if (reg && model) return `${reg} · ${model}`;
  return reg || model || null;
}

export function getDateGroup(iso: string): DateGroup {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) return 'today';
  if (msgDay.getTime() === yesterday.getTime()) return 'yesterday';
  return 'earlier';
}

export function groupMessagesByDate(messages: MailboxMessage[]): DateGroupedMessages[] {
  const groups: Record<DateGroup, MailboxMessage[]> = { today: [], yesterday: [], earlier: [] };
  for (const m of messages) {
    groups[getDateGroup(m.sent_at)].push(m);
  }
  return (['today', 'yesterday', 'earlier'] as DateGroup[])
    .filter((g) => groups[g].length > 0)
    .map((g) => ({ group: g, label: DATE_GROUP_LABELS[g], messages: groups[g] }));
}

const MAILBOX_SELECT =
  '*, customers(id, full_name, email, phone), sender:profiles!communications_created_by_fkey(id, full_name)';

type CountRow = Pick<
  MailboxMessage,
  'direction' | 'is_draft' | 'is_important' | 'is_archived' | 'is_deleted' | 'is_spam' | 'message_type' | 'read_at'
>;

function matchesFolder(row: CountRow, folder: MailFolder): boolean {
  const archived = row.is_archived ?? false;
  const deleted = row.is_deleted ?? false;
  const spam = row.is_spam ?? false;
  const draft = row.is_draft ?? false;

  if (folder === 'trash') return deleted;
  if (folder === 'spam') return spam && !deleted;
  if (folder === 'archive') return archived && !deleted && !spam;
  if (deleted || spam) return false;
  if (archived && folder !== 'inbox') return false;

  switch (folder) {
    case 'drafts':
      return draft;
    case 'sent':
      return !draft && row.direction === 'outbound';
    case 'inbox':
      return !draft && row.direction === 'inbound' && !archived;
    default: {
      if (draft) return false;
      const types = FOLDER_MESSAGE_TYPES[folder];
      if (!types?.length) return false;
      const mt = row.message_type as EmailMessageType | null | undefined;
      if (mt && types.includes(mt)) return true;
      if (folder === 'enquiry' && row.direction === 'inbound' && (!mt || mt === 'manual' || mt === 'notification')) {
        return true;
      }
      return false;
    }
  }
}

function folderFilters(folder: MailFolder) {
  const base = { channel: 'email' as const };

  if (folder === 'trash') return { ...base, is_deleted: true };
  if (folder === 'spam') return { ...base, is_spam: true, is_deleted: false };
  if (folder === 'archive') return { ...base, is_archived: true, is_deleted: false, is_spam: false };
  if (folder === 'drafts') return { ...base, is_draft: true, is_deleted: false, is_spam: false };
  if (folder === 'sent') return { ...base, direction: 'outbound' as const, is_draft: false, is_deleted: false, is_spam: false };
  if (folder === 'inbox') {
    return { ...base, direction: 'inbound' as const, is_draft: false, is_archived: false, is_deleted: false, is_spam: false };
  }

  const types = FOLDER_MESSAGE_TYPES[folder];
  return {
    ...base,
    is_draft: false,
    is_archived: false,
    is_deleted: false,
    is_spam: false,
    message_type: types,
  };
}

export async function loadMailboxMessages(
  folder: MailFolder,
  limit = 300,
): Promise<MailboxMessage[]> {
  let query = db
    .from('communications')
    .select(MAILBOX_SELECT)
    .order('sent_at', { ascending: false })
    .limit(limit);

  const filters = folderFilters(folder);
  query = query.eq('channel', filters.channel);

  if ('is_deleted' in filters) query = query.eq('is_deleted', filters.is_deleted);
  if ('is_spam' in filters && filters.is_spam !== undefined) query = query.eq('is_spam', filters.is_spam);
  if ('is_archived' in filters && filters.is_archived !== undefined) query = query.eq('is_archived', filters.is_archived);
  if ('is_draft' in filters && filters.is_draft !== undefined) query = query.eq('is_draft', filters.is_draft);
  if ('direction' in filters && filters.direction) query = query.eq('direction', filters.direction);
  if ('message_type' in filters && filters.message_type?.length) query = query.in('message_type', filters.message_type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data as MailboxMessage[]) ?? [];

  if (folder === 'enquiry') {
    return attachVehicles(rows.filter((m) => matchesFolder(m, 'enquiry')));
  }

  return attachVehicles(rows);
}

async function attachVehicles(messages: MailboxMessage[]): Promise<MailboxMessage[]> {
  const customerIds = [...new Set(messages.map((m) => m.customer_id).filter(Boolean))];
  if (!customerIds.length) return messages;

  const { data: vehicles } = await db
    .from('vehicles')
    .select('id, customer_id, brand, model, registration_number')
    .in('customer_id', customerIds)
    .order('updated_at', { ascending: false });

  const byCustomer = new Map<string, NonNullable<typeof vehicles>>();
  for (const v of vehicles ?? []) {
    const list = byCustomer.get(v.customer_id) ?? [];
    list.push(v);
    byCustomer.set(v.customer_id, list);
  }

  return messages.map((m) => ({
    ...m,
    vehicle: byCustomer.get(m.customer_id)?.[0] ?? null,
  }));
}

export async function loadMailboxFolderCounts(): Promise<Partial<Record<MailFolder, number>>> {
  const { data, error } = await db
    .from('communications')
    .select('direction, is_draft, is_important, is_archived, is_deleted, is_spam, message_type, read_at')
    .eq('channel', 'email');

  if (error || !data) return {};

  const counts: Partial<Record<MailFolder, number>> = {};
  for (const folder of MAIL_FOLDERS) {
    counts[folder.id] = (data as CountRow[]).filter((row) => matchesFolder(row, folder.id)).length;
  }
  return counts;
}

export async function loadUnreadMailboxCount(): Promise<number> {
  const { count, error } = await db
    .from('communications')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'email')
    .eq('direction', 'inbound')
    .eq('is_draft', false)
    .eq('is_deleted', false)
    .eq('is_spam', false)
    .eq('is_archived', false)
    .is('read_at', null);

  if (error) return 0;
  return count ?? 0;
}

export async function loadRecentMailboxPreview(limit = 5): Promise<MailboxMessage[]> {
  const { data, error } = await db
    .from('communications')
    .select(MAILBOX_SELECT)
    .eq('channel', 'email')
    .eq('is_draft', false)
    .eq('is_deleted', false)
    .eq('is_spam', false)
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data as MailboxMessage[]) ?? [];
}

export async function loadCustomerEmailHistory(
  customerId: string,
  limit = 20,
): Promise<MailboxMessage[]> {
  const { data, error } = await db
    .from('communications')
    .select(MAILBOX_SELECT)
    .eq('channel', 'email')
    .eq('customer_id', customerId)
    .eq('is_draft', false)
    .eq('is_deleted', false)
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data as MailboxMessage[]) ?? [];
}

export async function loadCustomerMailContext(customerId: string): Promise<CustomerMailContext | null> {
  const [customerRes, vehiclesRes, bookingsRes, invoicesRes, ordersRes] = await Promise.all([
    db.from('customers').select('id, full_name, email, phone, visit_count, notes').eq('id', customerId).single(),
    db.from('vehicles').select('id, brand, model, registration_number, year, color').eq('customer_id', customerId).order('updated_at', { ascending: false }),
    db
      .from('bookings')
      .select('id, scheduled_at, status, bay')
      .eq('customer_id', customerId)
      .not('status', 'in', '("completed","cancelled")')
      .order('scheduled_at', { ascending: true })
      .limit(5),
    db
      .from('invoices')
      .select('id, invoice_number, amount, status, due_date')
      .eq('customer_id', customerId)
      .in('status', ['draft', 'sent', 'overdue'])
      .order('due_date', { ascending: true })
      .limit(5),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
  ]);

  if (customerRes.error || !customerRes.data) return null;

  return {
    customer: customerRes.data,
    vehicles: vehiclesRes.data ?? [],
    activeBookings: bookingsRes.data ?? [],
    outstandingInvoices: invoicesRes.data ?? [],
    servicesCount: ordersRes.count ?? customerRes.data.visit_count ?? 0,
  };
}

export function computeMailboxStats(messages: MailboxMessage[], _folder: MailFolder): MailboxStats {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const sentToday = messages.filter(
    (m) => !m.is_draft && m.email_status === 'sent' && new Date(m.sent_at).getTime() >= todayMs,
  ).length;
  const failed = messages.filter((m) => !m.is_draft && m.email_status === 'failed').length;
  const unread = messages.filter((m) => !m.read_at && m.direction === 'inbound' && !m.is_draft).length;

  return { sentToday, failed, total: messages.length, unread };
}

export function filterMailboxMessages(messages: MailboxMessage[], filters: MailboxFilters): MailboxMessage[] {
  const q = filters.search.toLowerCase().trim();
  return messages.filter((m) => {
    if (filters.customerId && m.customer_id !== filters.customerId) return false;
    if (filters.type && m.message_type !== filters.type) return false;
    if (filters.status !== 'all') {
      const st = displayStatus(m);
      if (filters.status === 'read' && st !== 'read') return false;
      if (filters.status === 'sent' && st !== 'sent') return false;
      if (filters.status === 'failed' && st !== 'failed') return false;
      if (filters.status === 'draft' && st !== 'draft') return false;
      if (filters.status === 'unread' && (st === 'read' || m.is_draft)) return false;
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      if (new Date(m.sent_at).getTime() < from) return false;
    }
    if (filters.dateTo) {
      const to = new Date(`${filters.dateTo}T23:59:59`).getTime();
      if (new Date(m.sent_at).getTime() > to) return false;
    }
    if (!q) return true;
    const hay = [
      messageSubject(m),
      m.recipient_email,
      m.sender_email,
      m.customers?.full_name,
      m.customers?.email,
      m.content,
      m.body_text,
      m.sender?.full_name,
      vehicleLabel(m.vehicle),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export async function markMessageRead(messageId: string, profileId: string): Promise<void> {
  const { error } = await db
    .from('communications')
    .update({
      read_at: new Date().toISOString(),
      read_by_profile_id: profileId,
    })
    .eq('id', messageId)
    .is('read_at', null);

  if (error) throw new Error(error.message);
}

export async function markMessageUnread(messageId: string): Promise<void> {
  const { error } = await db
    .from('communications')
    .update({
      read_at: null,
      read_by_profile_id: null,
    })
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

export async function toggleMessageImportant(messageId: string, important: boolean): Promise<void> {
  const { error } = await db
    .from('communications')
    .update({ is_important: important })
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

export async function archiveMessage(messageId: string): Promise<void> {
  const { error } = await db
    .from('communications')
    .update({ is_archived: true })
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await db
    .from('communications')
    .update({ is_deleted: true })
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

export async function markMessageSpam(messageId: string): Promise<void> {
  const { error } = await db
    .from('communications')
    .update({ is_spam: true })
    .eq('id', messageId);

  if (error) throw new Error(error.message);
}

export async function saveDraft(params: {
  customerId: string;
  subject: string;
  body: string;
  messageType?: EmailMessageType;
  createdBy?: string;
  draftId?: string;
}): Promise<string> {
  const row = {
    customer_id: params.customerId,
    channel: 'email' as const,
    direction: 'outbound' as const,
    content: `${params.subject}\n\n${params.body.slice(0, 500)}`,
    subject: params.subject,
    body_text: params.body,
    message_type: params.messageType ?? 'manual',
    is_draft: true,
    email_status: null,
    created_by: params.createdBy ?? null,
    sent_at: new Date().toISOString(),
  };

  if (params.draftId) {
    const { error } = await db.from('communications').update(row).eq('id', params.draftId);
    if (error) throw new Error(error.message);
    return params.draftId;
  }

  const { data, error } = await db.from('communications').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function buildReplySubject(subject: string): string {
  const s = subject.trim();
  if (/^re:/i.test(s)) return s;
  return `Re: ${s}`;
}

export function buildForwardSubject(subject: string): string {
  const s = subject.trim();
  if (/^fwd:/i.test(s) || /^fw:/i.test(s)) return s;
  return `Fwd: ${s}`;
}

export function buildReplyBody(msg: MailboxMessage): string {
  const body = msg.body_text || msg.content;
  const from = msg.direction === 'inbound' ? senderLabel(msg) : recipientLabel(msg);
  const date = new Date(msg.sent_at).toLocaleString('ru-RU');
  return `\n\n---\n${date}, ${from}:\n${body}`;
}

export function buildForwardBody(msg: MailboxMessage): string {
  const body = msg.body_text || msg.content;
  const from = senderLabel(msg);
  const to = recipientLabel(msg);
  const date = new Date(msg.sent_at).toLocaleString('ru-RU');
  return [
    '',
    '---------- Пересланное сообщение ----------',
    `От: ${from}`,
    `Кому: ${to}`,
    `Дата: ${date}`,
    `Тема: ${messageSubject(msg)}`,
    '',
    body,
  ].join('\n');
}

export function fmtListDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Вчера';
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function fmtMsgDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('8') && digits.length === 11 ? `7${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}`;
}
