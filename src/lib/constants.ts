import type { UserRole, ViewId } from '../types/database';

/** Workshop Kanban columns (7 stages) */
export const WORKFLOW_STAGES = [
  'Входящие авто',
  'Осмотр',
  'Ожидает одобрения',
  'В работе',
  'Контроль качества',
  'Готов к выдаче',
  'Завершено',
] as const;

/** Legacy pipeline stages — mapped to workflow */
export const PIPELINE_STAGES = WORKFLOW_STAGES;

/** Kanban stage pill color, positionally matched to WORKFLOW_STAGES ('' = neutral/gray) */
export const WORKFLOW_STAGE_TONES: readonly string[] = ['', 'blue', 'amber', 'red', 'blue', 'green', 'green'];

export const JOB_STATUS_LABELS: Record<string, string> = {
  new_enquiry: 'Новый запрос',
  confirmed: 'Подтверждено',
  vehicle_received: 'Авто принято',
  inspection: 'Осмотр',
  awaiting_approval: 'Ожидает одобрения',
  in_progress: 'В работе',
  quality_check: 'Контроль качества',
  completed: 'Завершено',
  delivered: 'Выдано',
  cancelled: 'Отменено',
};

export const BOOKING_PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
};

export { JOB_WORKFLOW_CYCLE, JOB_WORKFLOW_CYCLE as JOB_STATUS_CYCLE } from './workflow';

export const CAL_BAYS = ['Бокс 1', 'Бокс 2', 'Бокс 3', 'Бокс 4', 'Приёмка'] as const;
export const CAL_START = 8;
export const CAL_END = 21;

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  ...JOB_STATUS_LABELS,
  new_enquiry: 'Новый запрос',
  confirmed: 'Подтверждено',
  cancelled: 'Отменено',
};

export const BOOKING_STATUS_CYCLE: string[] = [
  'new_enquiry',
  'confirmed',
  'vehicle_received',
  'inspection',
  'awaiting_approval',
  'in_progress',
  'quality_check',
  'completed',
  'delivered',
  'cancelled',
];

/** PostgREST embed for assigned technician FK */
export const BOOKING_SELECT =
  '*, customers(*), vehicles(*), services(*), staff:assigned_technician_id(*)';

/** Simplified labels for overview schedule */
export function overviewStatusLabel(status: string): string {
  if (status === 'in_progress') return 'В работе';
  if (status === 'completed' || status === 'delivered') return 'Завершено';
  if (status === 'cancelled') return 'Отменено';
  if (status === 'awaiting_approval') return 'Ожидание';
  if (status === 'quality_check') return 'Контроль';
  if (status === 'inspection') return 'Осмотр';
  if (status === 'vehicle_received') return 'Принято';
  if (status === 'new_enquiry') return 'Новый';
  return 'Запланировано';
}

export function overviewStatusClass(status: string): string {
  if (status === 'in_progress') return 'progress';
  if (status === 'completed') return 'done';
  if (status === 'cancelled') return 'planned';
  return 'planned';
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает оплаты',
  overdue: 'Просрочен',
  paid: 'Оплачено',
};

export const PAYMENT_RECORD_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  waiting_for_capture: 'Ожидает подтверждения',
  succeeded: 'Успешно',
  canceled: 'Отменён',
  failed: 'Ошибка',
};

export const PAYMENT_PROVIDER_LABELS: Record<string, string> = {
  yookassa: 'ЮKassa',
  tinkoff: 'Тинькофф',
  demo: 'Демо',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Не оплачено',
  partial: 'Частично',
  paid: 'Оплачено',
};

export const COMM_CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  phone: 'Телефон',
  telegram: 'Telegram',
};

export const COMM_DIRECTION_LABELS: Record<string, string> = {
  inbound: 'Входящее',
  outbound: 'Исходящее',
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  website: 'Сайт',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  phone: 'Телефон',
  referral: 'Рекомендация',
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  contacted: 'Связались',
  qualified: 'Квалифицирован',
  converted: 'Конвертирован',
  lost: 'Потерян',
  junk: 'Спам',
};

export const LEAD_LOST_REASONS = [
  'Выбрали другую студию',
  'Слишком высокая цена',
  'Не отвечает на звонки',
  'Отложили решение',
  'Передумали',
  'Другое',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Супер-админ',
  studio_owner: 'Менеджер / Владелец',
  reception: 'Ресепшн / Администратор',
  detailer: 'Техник / Детейлер',
  accountant: 'Бухгалтер',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Полный доступ: все модули, пользователи, настройки, склад, финансы',
  studio_owner: 'Управление студией: все операции, персонал, услуги, финансы, пользователи',
  reception: 'Операции и CRM: брони, клиенты, лиды, финансы, осмотр, документы',
  detailer: 'Цех: назначенные заказы, доска цеха, осмотр, фото работ',
  accountant: 'Финансы: счета, отчёты, клиентская база (просмотр)',
};

export const VIEW_TITLES: Record<ViewId, string> = {
  overview: 'Обзор',
  jobs: 'Заказы',
  bookings: 'Бронирования',
  pipeline: 'Производство',
  vehicles: 'Автомобили',
  customers: 'Клиенты',
  leads: 'Лиды',
  staff: 'Сотрудники',
  services: 'Услуги',
  finance: 'Финансы',
  mailbox: 'Почта',
  inventory: 'Склад',
  inspection: 'Осмотр',
  documents: 'Документы',
  reports: 'Отчёты',
  settings: 'Настройки',
};

/** @deprecated Legacy storage buckets — files are stored locally via r2Storage.ts */
export const STORAGE_BUCKETS = {
  customerPhotos: 'customer-photos',
  vehiclePhotos: 'vehicle-photos',
  jobPhotos: 'job-photos',
  documents: 'documents',
} as const;

export function fmt(n: number): string {
  return n.toLocaleString('ru-RU') + ' ₽';
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function vehicleDisplayName(v: { brand: string; model: string }): string {
  return `${v.brand} ${v.model}`;
}

export function leadVehicleDisplay(lead: { car_brand?: string | null; car_model?: string | null }): string {
  const parts = [lead.car_brand, lead.car_model].filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}

/** Local assets — see src/lib/cdn.ts */
export { CDN_BASE, cdnAsset, BRAND_LOGO_URL } from './cdn';
