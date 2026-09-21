import { bookingValue } from './metrics';
import type { Booking, InventoryItem, Service, ServiceMaterialRecipe, ServicePackage, ServiceQuote } from '../types/database';
import { inRange, type FinancePeriod, getFinancePeriodRange } from './analytics';

export type ServiceCategoryId =
  | 'wash'
  | 'decon'
  | 'polishing'
  | 'correction'
  | 'coating'
  | 'ppf'
  | 'interior'
  | 'protection'
  | 'restoration'
  | 'packages'
  | 'addons';

export const SERVICE_CATEGORIES: Record<ServiceCategoryId, { label: string; subcategories: { id: string; label: string }[] }> = {
  wash: {
    label: 'Мойка и подготовка',
    subcategories: [
      { id: 'express', label: 'Экспресс-мойка' },
      { id: 'detailed', label: 'Детальная мойка' },
      { id: 'engine', label: 'Моторный отсек' },
      { id: 'underbody', label: 'Днище / арки' },
    ],
  },
  decon: {
    label: 'Деконтаминация',
    subcategories: [
      { id: 'iron', label: 'Удаление металла' },
      { id: 'tar', label: 'Битум / смола' },
      { id: 'clay', label: 'Глина' },
      { id: 'prewash', label: 'Предварительная мойка' },
    ],
  },
  polishing: {
    label: 'Полировка',
    subcategories: [
      { id: 'one_step', label: '1-этапная' },
      { id: 'two_step', label: '2-этапная' },
      { id: 'multi_step', label: 'Многоэтапная' },
      { id: 'finishing', label: 'Финиш' },
    ],
  },
  correction: {
    label: 'Коррекция ЛКП',
    subcategories: [
      { id: 'light', label: 'Лёгкая' },
      { id: 'medium', label: 'Средняя' },
      { id: 'heavy', label: 'Глубокая' },
      { id: 'spot', label: 'Локальная' },
    ],
  },
  coating: {
    label: 'Покрытия',
    subcategories: [
      { id: 'ceramic', label: 'Керамика' },
      { id: 'graphene', label: 'Графен' },
      { id: 'sealant', label: 'Герметик' },
      { id: 'wax', label: 'Воск' },
    ],
  },
  ppf: {
    label: 'PPF / антигравий',
    subcategories: [
      { id: 'front', label: 'Передняя часть' },
      { id: 'full', label: 'Полная оклейка' },
      { id: 'partial', label: 'Частичная' },
      { id: 'strip', label: 'Полосы / зоны' },
    ],
  },
  interior: {
    label: 'Салон',
    subcategories: [
      { id: 'vacuum', label: 'Пылесос / сухая' },
      { id: 'deep_clean', label: 'Глубокая чистка' },
      { id: 'leather', label: 'Кожа' },
      { id: 'odor', label: 'Удаление запахов' },
      { id: 'fabric', label: 'Ткань / алcantara' },
    ],
  },
  protection: {
    label: 'Защита',
    subcategories: [
      { id: 'wheel', label: 'Диски' },
      { id: 'glass', label: 'Стёкла' },
      { id: 'trim', label: 'Пластик / trim' },
      { id: 'fabric', label: 'Ткань / кожа' },
    ],
  },
  restoration: {
    label: 'Восстановление',
    subcategories: [
      { id: 'headlight', label: 'Фары' },
      { id: 'trim', label: 'Экстерьер trim' },
      { id: 'scratch', label: 'Царапины' },
      { id: 'chip', label: 'Сколы' },
    ],
  },
  packages: {
    label: 'Пакеты',
    subcategories: [
      { id: 'basic', label: 'Базовый' },
      { id: 'premium', label: 'Премиум' },
      { id: 'seasonal', label: 'Сезонный' },
      { id: 'new_car', label: 'Новый автомобиль' },
    ],
  },
  addons: {
    label: 'Доп. услуги',
    subcategories: [
      { id: 'pet_hair', label: 'Шерсть животных' },
      { id: 'stain', label: 'Пятна' },
      { id: 'pickup', label: 'Забор / доставка' },
      { id: 'express', label: 'Срочность' },
    ],
  },
};

export const CATEGORY_IDS = Object.keys(SERVICE_CATEGORIES) as ServiceCategoryId[];

export const VEHICLE_TYPES = [
  { id: 'small', label: 'Малый' },
  { id: 'sedan', label: 'Седан' },
  { id: 'suv', label: 'SUV / кроссовер' },
  { id: 'luxury', label: 'Премиум / люкс' },
  { id: 'sports', label: 'Спорткар' },
  { id: 'commercial', label: 'Коммерческий' },
] as const;

export type VehicleTypeId = (typeof VEHICLE_TYPES)[number]['id'];

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Простая',
  medium: 'Средняя',
  hard: 'Сложная',
  expert: 'Экспертная',
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  sent: 'Отправлено',
  accepted: 'Принято',
  rejected: 'Отклонено',
  expired: 'Истекло',
};

export const DEFAULT_VEHICLE_PRICING: Record<VehicleTypeId, number> = {
  small: 0.9,
  sedan: 1,
  suv: 1.2,
  luxury: 1.5,
  sports: 1.3,
  commercial: 1.4,
};

/**
 * Early builds / demo data stored short, ad-hoc category keys that never existed
 * in SERVICE_CATEGORIES, so the UI printed them raw ("ceramic", "tint"...) and
 * the category filter could not match those services. Map them onto the
 * canonical taxonomy. Data already saved in a browser is handled too, because
 * this runs at read time.
 */
const LEGACY_SERVICE_CATEGORIES: Record<string, { category: ServiceCategoryId; subcategory?: string }> = {
  ceramic: { category: 'coating', subcategory: 'ceramic' },
  polish: { category: 'polishing' },
  tint: { category: 'protection', subcategory: 'glass' },
  glass: { category: 'protection', subcategory: 'glass' },
  film: { category: 'ppf' },
};

/** Canonical category id for a stored value (legacy keys mapped, unknown kept as-is). */
export function normalizeServiceCategory(cat: string | null | undefined): string {
  if (!cat) return '';
  return LEGACY_SERVICE_CATEGORIES[cat]?.category ?? cat;
}

function normalizeServiceSubcategory(cat: string | null | undefined, sub: string | null | undefined): string | null | undefined {
  if (sub) return sub;
  return cat ? LEGACY_SERVICE_CATEGORIES[cat]?.subcategory ?? sub : sub;
}

export function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return '—';
  const id = normalizeServiceCategory(cat) as ServiceCategoryId;
  return SERVICE_CATEGORIES[id]?.label ?? cat;
}

export function subcategoryLabel(cat: string | null | undefined, sub: string | null | undefined): string {
  const subId = normalizeServiceSubcategory(cat, sub);
  if (!cat || !subId) return subId ?? '—';
  const id = normalizeServiceCategory(cat) as ServiceCategoryId;
  return SERVICE_CATEGORIES[id]?.subcategories.find((s) => s.id === subId)?.label ?? subId;
}

export function getVehiclePrice(service: Service, vehicleType: VehicleTypeId = 'sedan'): number {
  const base = service.base_price ?? service.price ?? 0;
  const mult = service.vehicle_pricing?.[vehicleType] ?? DEFAULT_VEHICLE_PRICING[vehicleType] ?? 1;
  return Math.round(base * mult);
}

export function calcServiceCost(
  service: Service,
  recipes: ServiceMaterialRecipe[],
  items: InventoryItem[],
  labourRate = 1500
): { materialCost: number; labourCost: number; totalCost: number; margin: number; marginPct: number } {
  const serviceRecipes = recipes.filter((r) => r.service_id === service.id);
  const materialCost = serviceRecipes.reduce((sum, r) => {
    const item = items.find((i) => i.id === r.item_id);
    return sum + (item?.unit_cost ?? 0) * r.quantity_per_service;
  }, 0);
  const labourCost = (service.labour_hours ?? service.duration_minutes / 60) * labourRate;
  const totalCost = materialCost + labourCost;
  const price = service.base_price ?? service.price ?? 0;
  const margin = price - totalCost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;
  return { materialCost, labourCost, totalCost, margin, marginPct };
}

export function calcPackagePrice(services: Service[], serviceIds: string[], discountPct: number): number {
  const subtotal = serviceIds.reduce((s, id) => {
    const svc = services.find((x) => x.id === id);
    return s + (svc?.base_price ?? svc?.price ?? 0);
  }, 0);
  return Math.round(subtotal * (1 - discountPct / 100));
}

export function computeServiceAnalytics(bookings: Booking[], services: Service[], period: FinancePeriod) {
  const range = getFinancePeriodRange(period);
  const inPeriod = bookings.filter((b) => inRange(b.scheduled_at, range) && ['completed', 'delivered'].includes(b.status));
  const counts: Record<string, number> = {};
  let revenue = 0;
  for (const b of inPeriod) {
    if (b.service_id) counts[b.service_id] = (counts[b.service_id] ?? 0) + 1;
    revenue += bookingValue(b);
  }
  const popular = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({
      service: services.find((s) => s.id === id),
      count,
      revenue: inPeriod.filter((b) => b.service_id === id).reduce((s, b) => s + bookingValue(b), 0),
    }));

  return { totalBookings: inPeriod.length, revenue, popular };
}

export function buildQuoteMailto(quote: ServiceQuote, customerEmail: string, vehicleLabel: string): string {
  const items = (quote.items ?? []) as { name: string; price: number; quantity?: number }[];
  const body = [
    'Здравствуйте!',
    '',
    'Коммерческое предложение Unique Detailing:',
    vehicleLabel ? `Автомобиль: ${vehicleLabel}` : '',
    '',
    ...items.map((i) => `• ${i.name}${i.quantity && i.quantity > 1 ? ` × ${i.quantity}` : ''} — ${i.price.toLocaleString('ru-RU')} ₽`),
    '',
    `Подитог: ${quote.subtotal.toLocaleString('ru-RU')} ₽`,
    quote.discount ? `Скидка: ${quote.discount.toLocaleString('ru-RU')} ₽` : '',
    `Итого: ${quote.total.toLocaleString('ru-RU')} ₽`,
    '',
    quote.notes ?? '',
    '',
    'С уважением, Unique Detailing',
  ].filter(Boolean).join('\n');

  return `mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent('Коммерческое предложение — Unique Detailing')}&body=${encodeURIComponent(body)}`;
}

export function exportServicesCSV(services: Service[]): string {
  const rows = [
    ['Название', 'Категория', 'Подкатегория', 'Сложность', 'Цена', 'Мин', 'Макс', 'Длительность мин', 'Трудозатраты ч', 'Активна'],
    ...services.map((s) => [
      s.name,
      normalizeServiceCategory(s.category),
      s.subcategory ?? '',
      s.difficulty_level ?? '',
      s.base_price ?? s.price,
      s.min_price ?? '',
      s.max_price ?? '',
      s.duration_minutes,
      s.labour_hours ?? '',
      s.is_active ? 'Да' : 'Нет',
    ]),
  ];
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function parseVehiclePricing(json: unknown): Record<VehicleTypeId, number> {
  if (!json || typeof json !== 'object') return { ...DEFAULT_VEHICLE_PRICING };
  return { ...DEFAULT_VEHICLE_PRICING, ...(json as Record<VehicleTypeId, number>) };
}

export function activePackages(packages: ServicePackage[]): ServicePackage[] {
  const today = new Date().toISOString().slice(0, 10);
  return packages.filter((p) => p.is_active && (!p.valid_until || p.valid_until >= today));
}
