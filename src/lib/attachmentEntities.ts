import { FILE_CATEGORIES } from './r2Storage';
import {
  canAccessView,
  canManageBookings,
  canManageCustomers,
  canManageFinance,
  canManageInventory,
  canManageLeads,
  canManageServices,
  canManageStaff,
  isStaff,
} from './permissions';
import type { FileEntityType, UserRole } from '../types/database';

export type AttachmentCategory = { id: string; label: string; sensitive?: boolean };

export type AttachmentEntityConfig = {
  type: FileEntityType;
  label: string;
  table: string;
  select: string;
  orderBy: string;
  formatLabel: (row: Record<string, unknown>) => string;
  canAccess: (role: UserRole | undefined) => boolean;
  categories: () => AttachmentCategory[];
  bookingId?: (entityId: string) => string | null;
};

export function canQuickAttach(role: UserRole | undefined): boolean {
  return isStaff(role);
}

export const ATTACHMENT_ENTITIES: AttachmentEntityConfig[] = [
  {
    type: 'booking',
    label: 'Бронь / заказ',
    table: 'bookings',
    select: 'id, scheduled_at, customers(full_name), vehicles(brand, model)',
    orderBy: 'scheduled_at',
    formatLabel: (r) => {
      const customer = r.customers as { full_name?: string } | null;
      const vehicle = r.vehicles as { brand?: string; model?: string } | null;
      const date = r.scheduled_at ? new Date(String(r.scheduled_at)).toLocaleDateString('ru-RU') : '';
      const veh = vehicle ? `${vehicle.brand ?? ''} ${vehicle.model ?? ''}`.trim() : '';
      return [customer?.full_name, veh, date].filter(Boolean).join(' · ') || String(r.id).slice(0, 8);
    },
    canAccess: canManageBookings,
    categories: () => FILE_CATEGORIES.booking.map((c) => ({ ...c })),
    bookingId: (id) => id,
  },
  {
    type: 'customer',
    label: 'Клиент',
    table: 'customers',
    select: 'id, full_name, phone',
    orderBy: 'full_name',
    formatLabel: (r) => {
      const phone = r.phone ? ` · ${r.phone}` : '';
      return `${r.full_name ?? '—'}${phone}`;
    },
    canAccess: canManageCustomers,
    categories: () => FILE_CATEGORIES.customer.map((c) => ({ ...c })),
  },
  {
    type: 'vehicle',
    label: 'Автомобиль',
    table: 'vehicles',
    select: 'id, brand, model, registration_number, customers(full_name)',
    orderBy: 'brand',
    formatLabel: (r) => {
      const customer = r.customers as { full_name?: string } | null;
      const plate = r.registration_number ? ` · ${r.registration_number}` : '';
      return `${r.brand ?? ''} ${r.model ?? ''}${plate}${customer?.full_name ? ` · ${customer.full_name}` : ''}`.trim();
    },
    canAccess: (role) => canAccessView(role, 'vehicles'),
    categories: () => FILE_CATEGORIES.vehicle.map((c) => ({ ...c })),
  },
  {
    type: 'staff',
    label: 'Сотрудник',
    table: 'staff',
    select: 'id, full_name, role',
    orderBy: 'full_name',
    formatLabel: (r) => `${r.full_name ?? '—'}${r.role ? ` · ${r.role}` : ''}`,
    canAccess: canManageStaff,
    categories: () => FILE_CATEGORIES.staff.map((c) => ({ ...c })),
  },
  {
    type: 'service',
    label: 'Услуга',
    table: 'services',
    select: 'id, name, category',
    orderBy: 'name',
    formatLabel: (r) => String(r.name ?? '—'),
    canAccess: canManageServices,
    categories: () => FILE_CATEGORIES.service.map((c) => ({ ...c })),
  },
  {
    type: 'invoice',
    label: 'Счёт',
    table: 'invoices',
    select: 'id, invoice_number, amount, customers(full_name)',
    orderBy: 'created_at',
    formatLabel: (r) => {
      const customer = r.customers as { full_name?: string } | null;
      return `${r.invoice_number ?? '—'} · ${customer?.full_name ?? '—'} · ${r.amount ?? 0} ₽`;
    },
    canAccess: canManageFinance,
    categories: () => FILE_CATEGORIES.invoice.map((c) => ({ ...c })),
  },
  {
    type: 'product',
    label: 'Склад / продукт',
    table: 'inventory_items',
    select: 'id, name, sku, type',
    orderBy: 'name',
    formatLabel: (r) => `${r.name ?? '—'}${r.sku ? ` · ${r.sku}` : ''}`,
    canAccess: canManageInventory,
    categories: () => FILE_CATEGORIES.product.map((c) => ({ ...c })),
  },
  {
    type: 'lead',
    label: 'Лид',
    table: 'leads',
    select: 'id, full_name, last_name, phone, car_brand, car_model',
    orderBy: 'created_at',
    formatLabel: (r) => {
      const name = [r.full_name, r.last_name].filter(Boolean).join(' ');
      const car = [r.car_brand, r.car_model].filter(Boolean).join(' ');
      return [name, car, r.phone].filter(Boolean).join(' · ') || String(r.id).slice(0, 8);
    },
    canAccess: canManageLeads,
    categories: () => FILE_CATEGORIES.lead.map((c) => ({ ...c })),
  },
];

export function getAccessibleAttachmentEntities(role: UserRole | undefined): AttachmentEntityConfig[] {
  return ATTACHMENT_ENTITIES.filter((e) => e.canAccess(role));
}

export function getAttachmentCategories(type: FileEntityType): AttachmentCategory[] {
  const cfg = ATTACHMENT_ENTITIES.find((e) => e.type === type);
  return cfg?.categories() ?? [{ id: 'general', label: 'Общие', sensitive: false }];
}
