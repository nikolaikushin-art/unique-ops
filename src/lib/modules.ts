import type { ViewId } from '../types/database';
import { VIEW_TITLES } from './constants';
import { db, isLocalDbReady } from './localdb';

export interface AppModule {
  id: ViewId;
  group: string;
  description: string;
  required?: boolean;
}

export const APP_MODULES: AppModule[] = [
  { id: 'overview', group: 'Операции', description: 'Сводка смены, график, финансы и загрузка цеха', required: true },
  { id: 'jobs', group: 'Операции', description: 'Заказы, чек-листы, фото до/после, статусы' },
  { id: 'bookings', group: 'Операции', description: 'Календарь боксов и список бронирований' },
  { id: 'pipeline', group: 'Операции', description: 'Kanban-доска цеха — 7 этапов производства' },
  { id: 'inspection', group: 'Операции', description: 'Осмотр автомобиля перед работами' },
  { id: 'vehicles', group: 'Клиенты и авто', description: 'Картотека автомобилей клиентов' },
  { id: 'customers', group: 'Клиенты и авто', description: 'CRM — клиенты, история, оборот' },
  { id: 'leads', group: 'Клиенты и авто', description: 'Входящие лиды и конверсия' },
  { id: 'staff', group: 'Команда', description: 'Персонал, навыки, посещаемость' },
  { id: 'services', group: 'Команда', description: 'Каталог услуг и прайс' },
  { id: 'finance', group: 'Управление', description: 'Счета, выручка, маржа' },
  { id: 'mailbox', group: 'Управление', description: 'Почта: входящие и исходящие, счета, уведомления, журнал отправки' },
  { id: 'inventory', group: 'Управление', description: 'Склад материалов и списания' },
  { id: 'documents', group: 'Управление', description: 'SOP, обучение, документы студии' },
  { id: 'reports', group: 'Управление', description: 'Аналитика и отчёты' },
  { id: 'settings', group: 'Система', description: 'Настройки, пользователи, модули', required: true },
];

export function moduleTitle(id: ViewId): string {
  return VIEW_TITLES[id] ?? id;
}

/** Sensible out-of-the-box menu for a detailing studio: everything a
 *  technician or front-desk person touches daily stays on. Lead-tracking
 *  and the SOP/document library are real features, just not day-one
 *  essentials — owners can switch them back on in one tap from Settings
 *  → Модули, nothing is deleted or lost by turning this off. */
const DEFAULT_DISABLED_MODULES: ViewId[] = ['leads', 'documents'];

/** localStorage cache only — source of truth is studio_settings.disabled_modules */
const STORAGE_KEY = 'uo-disabled-modules';

export function loadDisabledModules(): ViewId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISABLED_MODULES;
    const parsed = JSON.parse(raw) as ViewId[];
    return Array.isArray(parsed) ? parsed : DEFAULT_DISABLED_MODULES;
  } catch {
    return DEFAULT_DISABLED_MODULES;
  }
}

export function saveDisabledModules(ids: ViewId[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export async function loadDisabledModulesFromDb(): Promise<ViewId[] | null> {
  if (!isLocalDbReady) return null;
  const { data, error } = await db
    .from('studio_settings')
    .select('value')
    .eq('key', 'disabled_modules')
    .maybeSingle();
  if (error || !data?.value) return null;
  const parsed = data.value as ViewId[];
  return Array.isArray(parsed) ? parsed : null;
}

export async function saveDisabledModulesToDb(ids: ViewId[], userId?: string) {
  if (!isLocalDbReady) return;
  await db.from('studio_settings').upsert({
    key: 'disabled_modules',
    value: ids,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  });
}

export function isModuleEnabled(id: ViewId, disabled: ViewId[]): boolean {
  if (APP_MODULES.find((m) => m.id === id)?.required) return true;
  return !disabled.includes(id);
}
