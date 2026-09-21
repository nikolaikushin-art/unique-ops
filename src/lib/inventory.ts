import type { FinancePeriod, DateRange } from './analytics';
import { getFinancePeriodRange, inRange } from './analytics';
import type { InventoryItem, InventoryUsage, InventoryIssue, InventoryWaste } from '../types/database';

export type DetailingCategory = 'chemicals' | 'ppf' | 'polishing' | 'tools' | 'consumables' | 'equipment';

export const DETAILING_CATEGORIES: Record<DetailingCategory, { label: string; subcategories: { id: string; label: string }[] }> = {
  chemicals: {
    label: 'Химия',
    subcategories: [
      { id: 'wash', label: 'Шампунь / мойка' },
      { id: 'degreaser', label: 'Обезжириватель' },
      { id: 'iron_remover', label: 'Очиститель металла' },
      { id: 'clay', label: 'Глина / очистка' },
      { id: 'coating', label: 'Керамика / покрытие' },
      { id: 'sealant', label: 'Герметик / воск' },
      { id: 'interior', label: 'Салон' },
      { id: 'wheel', label: 'Диски' },
      { id: 'glass', label: 'Стёкла' },
    ],
  },
  ppf: {
    label: 'Плёнка PPF',
    subcategories: [
      { id: 'full_roll', label: 'Рулон полный' },
      { id: 'partial_kit', label: 'Комплект частичный' },
      { id: 'pre_cut', label: 'Преднарезка' },
      { id: 'accessory', label: 'Аксессуары PPF' },
    ],
  },
  polishing: {
    label: 'Полировка',
    subcategories: [
      { id: 'compound', label: 'Абразив / паста' },
      { id: 'polish', label: 'Полироль' },
      { id: 'finishing', label: 'Финиш' },
      { id: 'pad', label: 'Круги / пад' },
      { id: 'buffing', label: 'Баффинг' },
    ],
  },
  tools: {
    label: 'Инструменты',
    subcategories: [
      { id: 'machine', label: 'Машинка' },
      { id: 'brush', label: 'Кисти / щётки' },
      { id: 'applicator', label: 'Аппликаторы' },
      { id: 'measuring', label: 'Измерение' },
      { id: 'safety', label: 'Защита' },
    ],
  },
  consumables: {
    label: 'Расходники',
    subcategories: [
      { id: 'microfiber', label: 'Микрофибра' },
      { id: 'tape', label: 'Лента / малярка' },
      { id: 'gloves', label: 'Перчатки' },
      { id: 'filters', label: 'Фильтры' },
      { id: 'misc', label: 'Прочее' },
    ],
  },
  equipment: {
    label: 'Оборудование',
    subcategories: [
      { id: 'extractor', label: 'Экстрактор' },
      { id: 'compressor', label: 'Компрессор' },
      { id: 'lighting', label: 'Освещение' },
      { id: 'lift', label: 'Подъёмник' },
      { id: 'dryer', label: 'Сушка' },
    ],
  },
};

export const CATEGORY_IDS = Object.keys(DETAILING_CATEGORIES) as DetailingCategory[];

/** Legacy / free-form category ids that older data still carries. */
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  tint: 'Тонировка',
  ceramic: 'Керамика',
  polish: 'Полировка',
  wash: 'Мойка',
  interior: 'Салон',
  consumable: 'Расходники',
  film: 'Плёнка',
};

export function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return '—';
  return DETAILING_CATEGORIES[cat as DetailingCategory]?.label ?? LEGACY_CATEGORY_LABELS[cat] ?? cat;
}

export function subcategoryLabel(cat: string | null | undefined, sub: string | null | undefined): string {
  if (!cat || !sub) return sub ?? '—';
  const found = DETAILING_CATEGORIES[cat as DetailingCategory]?.subcategories.find((s) => s.id === sub);
  return found?.label ?? sub;
}

export function calcInventoryValue(items: InventoryItem[]): number {
  return items
    .filter((i) => i.is_active !== false)
    .reduce((sum, i) => sum + Number(i.stock_level) * Number(i.unit_cost ?? 0), 0);
}

export function calcMonthlyConsumption(
  usage: InventoryUsage[],
  issues: InventoryIssue[],
  waste: InventoryWaste[],
  period: FinancePeriod = 'monthly',
  customRange?: DateRange
): number {
  const range = customRange ?? getFinancePeriodRange(period);
  const usageQty = usage.filter((u) => inRange(u.used_at, range)).reduce((s, u) => s + Number(u.quantity_used), 0);
  const issueQty = issues.filter((i) => inRange(i.issued_at, range)).reduce((s, i) => s + Number(i.quantity), 0);
  const wasteQty = waste.filter((w) => inRange(w.recorded_at, range)).reduce((s, w) => s + Number(w.quantity), 0);
  return usageQty + issueQty + wasteQty;
}

export function calcConsumptionCost(
  usage: InventoryUsage[],
  issues: InventoryIssue[],
  waste: InventoryWaste[],
  items: InventoryItem[],
  period: FinancePeriod = 'monthly',
  customRange?: DateRange
): number {
  const range = customRange ?? getFinancePeriodRange(period);
  const costMap = new Map(items.map((i) => [i.id, Number(i.unit_cost ?? 0)]));
  const sumUsage = usage
    .filter((u) => inRange(u.used_at, range))
    .reduce((s, u) => s + Number(u.quantity_used) * (costMap.get(u.item_id) ?? 0), 0);
  const sumIssues = issues
    .filter((i) => inRange(i.issued_at, range))
    .reduce((s, i) => s + Number(i.quantity) * (costMap.get(i.item_id) ?? 0), 0);
  const sumWaste = waste
    .filter((w) => inRange(w.recorded_at, range))
    .reduce((s, w) => s + Number(w.quantity) * (costMap.get(w.item_id) ?? 0), 0);
  return sumUsage + sumIssues + sumWaste;
}

export function getExpiringItems(items: InventoryItem[], withinDays = 30): InventoryItem[] {
  const now = new Date();
  const limit = new Date(now);
  limit.setDate(limit.getDate() + withinDays);
  return items.filter((i) => {
    if (!i.expiry_date) return false;
    const exp = new Date(i.expiry_date);
    return exp <= limit;
  }).sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime());
}

export function getExpiredItems(items: InventoryItem[]): InventoryItem[] {
  const now = startOfToday();
  return items.filter((i) => i.expiry_date && new Date(i.expiry_date) < now);
}

export function getLowStock(items: InventoryItem[]): InventoryItem[] {
  return items.filter((i) => i.is_active !== false && Number(i.stock_level) <= Number(i.min_stock_level));
}

export function calcWastePercent(
  usage: InventoryUsage[],
  issues: InventoryIssue[],
  waste: InventoryWaste[],
  period: FinancePeriod = 'monthly'
): number {
  const range = getFinancePeriodRange(period);
  const consumed = usage.filter((u) => inRange(u.used_at, range)).reduce((s, u) => s + Number(u.quantity_used), 0)
    + issues.filter((i) => inRange(i.issued_at, range)).reduce((s, i) => s + Number(i.quantity), 0);
  const wasted = waste.filter((w) => inRange(w.recorded_at, range)).reduce((s, w) => s + Number(w.quantity), 0);
  if (!consumed) return 0;
  return (wasted / (consumed + wasted)) * 100;
}

export function getTopConsumed(
  usage: InventoryUsage[],
  issues: InventoryIssue[],
  items: InventoryItem[],
  period: FinancePeriod = 'monthly',
  limit = 5
): { item: InventoryItem; qty: number }[] {
  const range = getFinancePeriodRange(period);
  const qtyMap = new Map<string, number>();
  for (const u of usage.filter((x) => inRange(x.used_at, range))) {
    qtyMap.set(u.item_id, (qtyMap.get(u.item_id) ?? 0) + Number(u.quantity_used));
  }
  for (const i of issues.filter((x) => inRange(x.issued_at, range))) {
    qtyMap.set(i.item_id, (qtyMap.get(i.item_id) ?? 0) + Number(i.quantity));
  }
  return [...qtyMap.entries()]
    .map(([id, qty]) => ({ item: items.find((it) => it.id === id)!, qty }))
    .filter((x) => x.item)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function calcPpfRemaining(items: InventoryItem[]): number {
  return items
    .filter((i) => i.category === 'ppf' && i.is_active !== false)
    .reduce((s, i) => s + Number(i.stock_level), 0);
}

export function calcChemicalCount(items: InventoryItem[]): number {
  return items.filter((i) => i.category === 'chemicals' && i.is_active !== false).length;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isExpiringSoon(item: InventoryItem, withinDays = 30): boolean {
  if (!item.expiry_date) return false;
  const exp = new Date(item.expiry_date);
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  return exp <= limit && exp >= startOfToday();
}

export function isExpired(item: InventoryItem): boolean {
  if (!item.expiry_date) return false;
  return new Date(item.expiry_date) < startOfToday();
}

export type PurchaseOrderStatus = 'draft' | 'submitted' | 'approved' | 'ordered' | 'received' | 'cancelled';

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Черновик',
  submitted: 'Отправлен',
  approved: 'Утверждён',
  ordered: 'Заказан',
  received: 'Получен',
  cancelled: 'Отменён',
};

export const PO_STATUS_CYCLE: PurchaseOrderStatus[] = [
  'draft', 'submitted', 'approved', 'ordered', 'received', 'cancelled',
];

export function nextPoStatus(current: string): PurchaseOrderStatus {
  const idx = PO_STATUS_CYCLE.indexOf(current as PurchaseOrderStatus);
  if (idx < 0) return 'draft';
  return PO_STATUS_CYCLE[(idx + 1) % PO_STATUS_CYCLE.length];
}

export function exportInventoryCSV(items: InventoryItem[]): void {
  const headers = [
    'Наименование', 'Категория', 'Подкатегория', 'Бренд', 'SKU', 'Поставщик',
    'Остаток', 'Мин.', 'Ед.', 'Себестоимость', 'Цена продажи', 'Срок годности', 'Место хранения',
  ];
  const rows = items.map((i) => [
    i.name,
    categoryLabel(i.category),
    subcategoryLabel(i.category, i.subcategory),
    i.brand ?? '',
    i.sku ?? '',
    i.supplier ?? '',
    i.stock_level,
    i.min_stock_level,
    i.unit,
    i.unit_cost ?? 0,
    i.selling_price ?? 0,
    i.expiry_date ?? '',
    i.storage_location ?? '',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventory_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
