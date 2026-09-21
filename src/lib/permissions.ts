import type { UserRole, ViewId } from '../types/database';

/** Internal staff roles only — no customer access */
const STAFF_ROLES: UserRole[] = ['super_admin', 'studio_owner', 'reception', 'detailer', 'accountant'];

export function isStaff(role: UserRole | undefined): boolean {
  return role ? STAFF_ROLES.includes(role) : false;
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'studio_owner';
}

export function isManager(role: UserRole | undefined): boolean {
  return role === 'studio_owner' || role === 'super_admin';
}

export function canAccessView(role: UserRole | undefined, view: ViewId): boolean {
  if (!role || !isStaff(role)) return false;
  if (isAdmin(role)) return true;

  const access: Record<UserRole, ViewId[]> = {
    super_admin: [],
    studio_owner: [],
    reception: ['overview', 'jobs', 'bookings', 'pipeline', 'vehicles', 'customers', 'leads', 'services', 'finance', 'mailbox', 'inspection', 'inventory', 'documents', 'settings'],
    detailer: ['overview', 'jobs', 'pipeline', 'vehicles', 'inspection', 'staff', 'services', 'settings'],
    accountant: ['overview', 'finance', 'mailbox', 'customers', 'reports', 'settings'],
  };

  return access[role]?.includes(view) ?? false;
}

export function canManageBookings(role: UserRole | undefined): boolean {
  return isAdmin(role) || role === 'reception';
}

export function canManageCustomers(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'studio_owner' || role === 'reception';
}

export function canManageFinance(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'studio_owner' || role === 'accountant' || role === 'reception';
}

export function canManageMailbox(role: UserRole | undefined): boolean {
  return canManageFinance(role) || role === 'reception';
}

export function canViewAllMailbox(role: UserRole | undefined): boolean {
  return isAdmin(role) || role === 'accountant' || role === 'reception';
}

export function canManageInventory(role: UserRole | undefined): boolean {
  return isAdmin(role);
}

export function canManageStaff(role: UserRole | undefined): boolean {
  return isAdmin(role);
}

export function canManageServices(role: UserRole | undefined): boolean {
  return isAdmin(role);
}

export function canManageInspections(role: UserRole | undefined): boolean {
  return isAdmin(role) || role === 'reception';
}

export function canViewInspections(role: UserRole | undefined): boolean {
  return canAccessView(role, 'inspection');
}

export function canManageLeads(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'studio_owner' || role === 'reception';
}

export function canApproveJobs(role: UserRole | undefined): boolean {
  return isManager(role) || role === 'reception';
}

export function canUploadPhotos(role: UserRole | undefined): boolean {
  return role === 'detailer' || isManager(role) || role === 'reception';
}

export function canQuickAttach(role: UserRole | undefined): boolean {
  return isStaff(role);
}

/** Dashboard layout scope by role */
export type DashboardView = 'full' | 'operations' | 'detailer' | 'finance';

export function getDashboardView(role: UserRole | undefined): DashboardView {
  if (isAdmin(role)) return 'full';
  if (role === 'accountant') return 'finance';
  if (role === 'detailer') return 'detailer';
  if (role === 'reception') return 'operations';
  return 'full';
}
